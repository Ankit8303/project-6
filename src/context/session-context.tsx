"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { stopTask as stopTaskAction, waitForRecording, getSessionStatus } from "@/lib/actions";
import { convertMessages, groupIntoTurns } from "@/lib/message-converter";
import {
  isDoneEvent,
  isErrorEvent,
  isMessageEvent,
  isScreenshotEvent,
  isInputRequiredEvent,
  isCaptchaEvent,
  isAgentSwitchedEvent,
} from "@/lib/stream-events";
import type { UIMessage, ConversationTurn, MessageResponse, InputRequestData } from "@/lib/types";

interface SessionState {
  id: string;
  liveUrl?: string | null;
  status: string;
  output?: unknown;
  screenshot?: string | null;
}

interface SessionContextType {
  sessionId: string;
  session: SessionState | null;
  screenshot: string | null;
  messages: UIMessage[];
  turns: ConversationTurn[];
  isLoading: boolean;
  isBusy: boolean;
  isTerminal: boolean;
  isSending: boolean;
  recordingUrls: string[];
  streamError: string | null;
  activeInputRequest: InputRequestData | null;
  captchaNotification: { detected: boolean; message: string; autoSolving: boolean } | null;
  activeAgent: { role: string; name: string; task: string } | null;
  clearInputRequest: () => void;
  sendMessage: (task: string) => Promise<void>;
  stopTask: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | null>(null);

const TERMINAL = new Set(["stopped", "error", "timed_out"]);

export function SessionProvider({
  sessionId,
  initialLiveUrl,
  initialTask,
  children,
}: {
  sessionId: string;
  initialLiveUrl?: string;
  initialTask?: string;
  children: ReactNode;
}) {
  const [rawMessages, setRawMessages] = useState<MessageResponse[]>([]);
  const [session, setSession] = useState<SessionState | null>(
    initialLiveUrl ? { id: sessionId, liveUrl: initialLiveUrl, status: "created" } : null,
  );
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(!!initialTask);
  const [recordingUrls, setRecordingUrls] = useState<string[]>([]);
  const [streamError, setError] = useState<string | null>(null);
  const [activeInputRequest, setActiveInputRequest] = useState<InputRequestData | null>(null);
  const [captchaNotification, setCaptchaNotification] = useState<{
    detected: boolean;
    message: string;
    autoSolving: boolean;
  } | null>(null);
  const [activeAgent, setActiveAgent] = useState<{
    role: string;
    name: string;
    task: string;
  } | null>(null);

  const clearInputRequest = useCallback(() => {
    setActiveInputRequest(null);
  }, []);

  const sendingRef = useRef(false);
  const recordingFetchedRef = useRef(false);

  const isTerminal = !!session && TERMINAL.has(session.status);
  const isBusy = session?.status === "running" || session?.status === "waiting_input";

  // Stream messages from the SSE route handler
  const streamTask = useCallback(
    async (task: string) => {
      setIsLoading(false);
      setError(null);
      setSession((prev) => prev ? { ...prev, status: "running" } : prev);

      const res = await fetch(`/api/stream/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = JSON.parse(line.slice(6));

          if (isScreenshotEvent(json)) {
            setScreenshot(json.screenshot);
          } else if (isInputRequiredEvent(json)) {
            setActiveInputRequest(json.inputRequired as InputRequestData);
            setSession((prev) => prev ? { ...prev, status: "waiting_input" } : prev);
          } else if (isCaptchaEvent(json)) {
            setCaptchaNotification(json.captchaDetected);
          } else if (isAgentSwitchedEvent(json)) {
            setActiveAgent(json.agentSwitched);
          } else if (isDoneEvent(json)) {
            setActiveInputRequest(null);
            setCaptchaNotification(null);
            setSession((prev) => ({
              ...(prev ?? { id: json.session.id, status: json.session.status }),
              ...json.session,
            }));
            if (json.session.screenshot) {
              setScreenshot(json.session.screenshot);
            }
          } else if (isErrorEvent(json)) {
            // The session can no longer accept tasks — make that visible in the
            // UI instead of only logging it to the console.
            const errMsg = json.message || json.error || "An unexpected error occurred during execution";
            console.error("Stream error:", errMsg);
            setError(errMsg);
            if (json.code === "session_ended") {
              setSession((prev) =>
                prev ? { ...prev, status: "stopped" } : prev,
              );
            }
          } else if (isMessageEvent(json)) {
            const msg = json.message;
            setRawMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        }
      }
    },
    [sessionId],
  );

  // Convert raw API messages → UI messages
  const serverMessages = useMemo(
    () => convertMessages(rawMessages),
    [rawMessages],
  );

  const turns = useMemo(() => groupIntoTurns(serverMessages), [serverMessages]);

  const sendMessage = useCallback(
    async (task: string) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setIsSending(true);

      try {
        // The stream already includes the user message — no optimistic insert needed
        await streamTask(task);
      } catch (err) {
        console.error("Failed to send task:", err);
        // Reset to idle so the user can retry — don't mark as terminal error
        // since this could be a transient network issue, not a session failure
        setSession((prev) => prev ? { ...prev, status: "idle" } : prev);
      } finally {
        sendingRef.current = false;
        setIsSending(false);
      }
    },
    [sessionId, streamTask],
  );

  // Auto-run initial task from URL params
  const initialTaskRef = useRef(initialTask);
  useEffect(() => {
    if (!initialTaskRef.current) return;
    const task = initialTaskRef.current;
    initialTaskRef.current = undefined;
    sendMessage(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate the real session status on mount. Without this the status stays
  // "created" for a session that already ended, so the UI offers follow-ups
  // the API will reject.
  useEffect(() => {
    let active = true;
    getSessionStatus(sessionId)
      .then((s) => {
        if (!active || !s) return;
        setSession((prev) => ({ ...(prev ?? { id: sessionId }), ...s }));
        if (s.screenshot) {
          setScreenshot(s.screenshot);
        }
      })
      .catch(() => {
        // Session may not exist yet — the initial task will create it
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Fetch recording URLs when session reaches terminal state
  useEffect(() => {
    if (!isTerminal || recordingFetchedRef.current) return;
    recordingFetchedRef.current = true;

    waitForRecording(sessionId).then((urls) => {
      if (urls.length) setRecordingUrls(urls);
    }).catch((err) => {
      console.error("Failed to fetch recording:", err);
    });
  }, [isTerminal, sessionId]);

  // Polling screenshot while busy when running on local browser (no liveUrl)
  useEffect(() => {
    if (!isBusy || session?.liveUrl) return;
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}/screenshot?t=${Date.now()}`);
        if (res.ok && active) {
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === "string" && active) {
              setScreenshot(reader.result);
            }
          };
          reader.readAsDataURL(blob);
        }
      } catch {}
    };

    const interval = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isBusy, sessionId, session?.liveUrl]);

  // Initial screenshot load
  useEffect(() => {
    if (!screenshot && !session?.liveUrl) {
      let active = true;
      fetch(`/api/session/${sessionId}/screenshot?t=${Date.now()}`)
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (!blob || !active) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === "string" && active) {
              setScreenshot(reader.result);
            }
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }
  }, [sessionId, session?.liveUrl, screenshot]);

  const stopTask = useCallback(async () => {
    try {
      await stopTaskAction(sessionId);
    } catch (err) {
      console.error("Failed to stop:", err);
    }
  }, [sessionId]);

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        session,
        screenshot,
        messages: serverMessages,
        turns,
        isLoading,
        isBusy,
        isTerminal,
        isSending,
        recordingUrls,
        streamError,
        activeInputRequest,
        captchaNotification,
        activeAgent,
        clearInputRequest,
        sendMessage,
        stopTask,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be inside SessionProvider");
  return ctx;
}
