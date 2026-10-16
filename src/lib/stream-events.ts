import type { MessageResponse } from "./types";

/** Events emitted by /api/stream/[sessionId]. */

export interface StreamMessageEvent {
  message: MessageResponse;
}

export interface StreamDoneEvent {
  session: {
    id: string;
    status: string;
    output?: unknown;
    liveUrl?: string | null;
    screenshot?: string | null;
  };
}

export interface StreamScreenshotEvent {
  screenshot: string;
}

export interface StreamInputRequiredEvent {
  inputRequired: {
    requestId: string;
    title: string;
    description?: string;
    fields: Array<{
      name: string;
      label: string;
      type: "text" | "password" | "number" | "select";
      placeholder?: string;
      required?: boolean;
      options?: string[];
    }>;
    agentRole?: string;
  };
}

export interface StreamCaptchaEvent {
  captchaDetected: {
    detected: boolean;
    message: string;
    autoSolving: boolean;
  };
}

export interface StreamAgentSwitchedEvent {
  agentSwitched: {
    role: string;
    name: string;
    task: string;
  };
}

export interface StreamErrorEvent {
  message?: string;
  error?: string;
  /** Set when the session had already ended and could not accept the task. */
  code?: "session_ended";
}

/**
 * A message event. Requires `message.id`, because a bare `message` key also
 * appears on legacy error frames ({ __error, message }) and must not be
 * mistaken for a MessageResponse.
 */
export function isMessageEvent(
  payload: unknown,
): payload is StreamMessageEvent {
  if (typeof payload !== "object" || payload === null) return false;
  if (!("message" in payload)) return false;
  const msg = (payload as { message?: unknown }).message;
  return typeof msg === "object" && msg !== null && "id" in msg;
}

export function isDoneEvent(payload: unknown): payload is StreamDoneEvent {
  if (typeof payload !== "object" || payload === null) return false;
  const s = (payload as { session?: unknown }).session;
  return typeof s === "object" && s !== null && "status" in s;
}

export function isErrorEvent(payload: unknown): payload is StreamErrorEvent {
  if (typeof payload !== "object" || payload === null) return false;
  return (
    ("error" in payload && typeof (payload as { error?: unknown }).error === "string") ||
    ("code" in payload && (payload as { code?: unknown }).code === "session_ended")
  );
}

export function isScreenshotEvent(
  payload: unknown,
): payload is StreamScreenshotEvent {
  if (typeof payload !== "object" || payload === null) return false;
  return (
    "screenshot" in payload &&
    typeof (payload as { screenshot?: unknown }).screenshot === "string"
  );
}

export function isInputRequiredEvent(
  payload: unknown,
): payload is StreamInputRequiredEvent {
  if (typeof payload !== "object" || payload === null) return false;
  return (
    "inputRequired" in payload &&
    typeof (payload as { inputRequired?: unknown }).inputRequired === "object" &&
    (payload as { inputRequired?: unknown }).inputRequired !== null
  );
}

export function isCaptchaEvent(
  payload: unknown,
): payload is StreamCaptchaEvent {
  if (typeof payload !== "object" || payload === null) return false;
  return (
    "captchaDetected" in payload &&
    typeof (payload as { captchaDetected?: unknown }).captchaDetected === "object" &&
    (payload as { captchaDetected?: unknown }).captchaDetected !== null
  );
}

export function isAgentSwitchedEvent(
  payload: unknown,
): payload is StreamAgentSwitchedEvent {
  if (typeof payload !== "object" || payload === null) return false;
  return (
    "agentSwitched" in payload &&
    typeof (payload as { agentSwitched?: unknown }).agentSwitched === "object" &&
    (payload as { agentSwitched?: unknown }).agentSwitched !== null
  );
}
