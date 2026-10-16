// ── API response types ──

export interface SessionResponse {
  id: string;
  status: string;
  output?: unknown;
  liveUrl?: string | null;
  recordingUrls?: string[];
  createdAt?: string;
}

export interface MessageResponse {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content?: string | null;
  data?: unknown;
  createdAt: string;
  hidden?: boolean;
}

export interface MessageListResponse {
  messages: MessageResponse[];
  hasMore?: boolean;
}

export interface WorkspaceView {
  id: string;
  name?: string | null;
  createdAt?: string;
}

// Parsed from data field (OpenAI format)
export interface ParsedMessageData {
  content?: string | ContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// ── Profiles ──

export interface Profile {
  id: string;
  name?: string | null;
  createdAt: string;
}

// ── Agent Roles ──

export type AgentRole =
  | "supervisor"
  | "auth"
  | "form_filler"
  | "navigator"
  | "extractor";

export interface AgentInfo {
  role: AgentRole;
  name: string;
  badge: string;
  color: string;
  icon: string;
}

// ── Interactive User Input Request ──

export interface InputRequestField {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

export interface InputRequestData {
  requestId: string;
  title: string;
  description?: string;
  fields: InputRequestField[];
  agentRole?: AgentRole;
}

// ── UI types ──

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentRole?: AgentRole;
  inputRequest?: InputRequestData;
  toolCalls?: UIToolCall[];
  createdAt: string;
}

export interface UIToolCall {
  id: string;
  name: string;
  displayName: string;
  displayValue: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  result?: string;
  isError?: boolean;
  type: ToolCallType;
  agentRole?: AgentRole;
}

export type ToolStatus = "pending" | "running" | "completed" | "error";

export type ToolCallType =
  | "browse"
  | "click"
  | "type"
  | "scroll"
  | "search"
  | "wait"
  | "screenshot"
  | "read_file"
  | "create_file"
  | "edit_file"
  | "bash"
  | "glob"
  | "grep"
  | "integration"
  | "captcha"
  | "input"
  | "unknown";

// ── Turn grouping ──

export interface TaskStep {
  id: string;
  title: string;
  status: "in_progress" | "completed" | "error";
  agentRole?: AgentRole;
  inputRequest?: InputRequestData;
  toolCalls: UIToolCall[];
}

export interface ConversationTurn {
  id: string;
  userMessage: UIMessage;
  steps: TaskStep[];
  finalContent: string;
  isComplete: boolean;
}
