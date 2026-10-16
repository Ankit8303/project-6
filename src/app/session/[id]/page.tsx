"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Download, ShieldAlert, Sparkles } from "lucide-react";
import { SessionProvider, useSession } from "@/context/session-context";
import { ChatInput } from "@/components/chat-input";
import { ChatMessages } from "@/components/chat-messages";
import { BrowserPanel } from "@/components/browser-panel";
import { AgentBadge } from "@/components/agent-badge";
import { CredentialRequestCard } from "@/components/credential-request-card";

function SessionPage() {
  const {
    session,
    screenshot,
    sessionId,
    turns,
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
  } = useSession();
  const chatRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns]);

  const liveUrl = session?.liveUrl;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Chat column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Multi-Agent Header Banner */}
        <div className="h-11 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-950/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-indigo-400" />
            <span className="text-xs font-medium text-zinc-400">Active Agent:</span>
            <AgentBadge role={activeAgent?.role || "supervisor"} size="sm" />
          </div>
          {activeAgent?.task && (
            <span className="text-[11px] text-zinc-400 truncate max-w-[280px]">
              Task: {activeAgent.task}
            </span>
          )}
        </div>

        {/* Messages */}
        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="max-w-2xl mx-auto">
            <ChatMessages turns={turns} isBusy={isBusy} />

            {/* Recording links */}
            {recordingUrls.length > 0 && (
              <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Recording available
                </p>
                <div className="flex flex-col gap-2">
                  {recordingUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Download className="h-4 w-4" />
                      {recordingUrls.length === 1
                        ? "Download recording (MP4)"
                        : `Download recording ${i + 1} (MP4)`}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CAPTCHA Notification Banner */}
        {captchaNotification && (
          <div className="mx-6 mb-2 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs flex items-center justify-between backdrop-blur-sm animate-pulse">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{captchaNotification.message}</span>
            </div>
            {captchaNotification.autoSolving && (
              <span className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
            )}
          </div>
        )}

        {/* On-Demand Credential / Form Dialog */}
        {activeInputRequest && (
          <div className="mx-6 mb-2">
            <CredentialRequestCard
              sessionId={sessionId}
              data={activeInputRequest}
              onSubmitSuccess={clearInputRequest}
            />
          </div>
        )}

        {/* Input */}
        {streamError && (
          <p className="px-6 pb-2 text-sm text-red-400 text-center break-all">
            {streamError}
          </p>
        )}
        <ChatInput
          onSend={sendMessage}
          isProcessing={isBusy || isSending}
          onStop={stopTask}
          disabled={isTerminal}
          placeholder={
            isTerminal
              ? "Session has ended"
              : "Send a follow-up…"
          }
        />
      </div>

      {/* Browser panel — always visible on desktop */}
      <div className="hidden lg:block w-[55%] shrink-0">
        <BrowserPanel
          liveUrl={liveUrl}
          screenshot={screenshot}
          sessionId={sessionId}
          isBusy={isBusy}
          turns={turns}
          isSessionEnded={isTerminal}
        />
      </div>
    </div>
  );
}

export default function SessionPageWrapper() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const liveUrl = searchParams.get("liveUrl") ?? undefined;

  // Read initial task from sessionStorage (not URL) to avoid exposing prompts
  const [initialTask] = useState(() => {
    if (typeof window === "undefined") return undefined;
    const key = `task-${params.id}`;
    const task = sessionStorage.getItem(key) ?? undefined;
    if (task) sessionStorage.removeItem(key);
    return task;
  });

  return (
    <SessionProvider sessionId={params.id} initialLiveUrl={liveUrl} initialTask={initialTask}>
      <SessionPage />
    </SessionProvider>
  );
}
