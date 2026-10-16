import type { ToolCallType, ToolStatus } from "./types";

// Map raw tool names → canonical type
const TYPE_MAP: Record<string, ToolCallType> = {
  bash: "bash", bash_output: "bash", shell: "bash", execute_command: "bash",
  read: "read_file", read_file: "read_file",
  write: "create_file", create_file: "create_file",
  edit: "edit_file", multi_edit: "edit_file", edit_file: "edit_file",
  browser_navigate: "browse", go_to_url: "browse", navigate: "browse",
  browser_click: "click", click_element: "click", click: "click",
  browser_act: "click", act: "click", stagehand_act: "click",
  browser_extract: "search", extract: "search", stagehand_extract: "search",
  browser_observe: "screenshot", observe: "screenshot", stagehand_observe: "screenshot",
  browser_type: "type", type_text: "type", input_text: "type",
  browser_scroll: "scroll", scroll: "scroll",
  web_search: "search", browser_search: "search", search: "search",
  browser_wait: "wait", wait: "wait", sleep: "wait",
  screenshot: "screenshot", take_screenshot: "screenshot", browser_screenshot: "screenshot",
  browser_analyze_state: "screenshot",
  glob: "glob", grep: "grep",
  request_user_input: "input",
  fill_form: "type",
  solve_captcha: "captcha",
  delegate_to_specialist: "integration",
};

const LABELS: Record<string, [string, string]> = {
  browse:      ["Navigating", "Navigated"],
  click:       ["Clicking", "Clicked"],
  type:        ["Typing / Filling form", "Typed / Form filled"],
  scroll:      ["Scrolling", "Scrolled"],
  search:      ["Searching", "Searched"],
  wait:        ["Waiting", "Waited"],
  screenshot:  ["Taking screenshot", "Took screenshot"],
  read_file:   ["Reading file", "Read file"],
  create_file: ["Creating file", "Created file"],
  edit_file:   ["Editing file", "Edited file"],
  bash:        ["Running command", "Ran command"],
  glob:        ["Finding files", "Found files"],
  grep:        ["Searching code", "Searched code"],
  integration: ["Delegating specialist", "Delegated specialist"],
  captcha:     ["Solving verification", "Verified / Solved"],
  input:       ["Waiting for user input", "Input provided"],
  unknown:     ["Running", "Ran"],
};

export function getToolType(name: string | undefined): ToolCallType {
  if (!name) return "unknown";
  return TYPE_MAP[name] ?? "unknown";
}

export function getToolLabel(name: string | undefined, status: ToolStatus = "pending"): string {
  const type = getToolType(name);
  const pair = LABELS[type] ?? LABELS.unknown;
  return status === "completed" || status === "error" ? pair[1] : pair[0];
}

export function getToolDisplayValue(name: string | undefined, args?: Record<string, unknown>): string {
  if (!name || !args) return "";
  if (args.instruction) {
    return truncate(String(args.instruction), 60);
  }
  const type = getToolType(name);
  switch (type) {
    case "browse":
      return truncate(String(args.url ?? ""), 60);
    case "search":
      return truncate(String(args.query ?? ""), 60);
    case "read_file":
    case "create_file":
    case "edit_file":
      return truncate(String(args.file_path ?? args.path ?? args.filename ?? ""), 60);
    case "bash":
      return truncate(String(args.command ?? args.cmd ?? ""), 50);
    case "glob":
    case "grep":
      return truncate(String(args.pattern ?? ""), 50);
    case "type":
      if (args.fields && Array.isArray(args.fields)) {
        return truncate(`Filling ${args.fields.length} form field${args.fields.length > 1 ? "s" : ""}`, 40);
      }
      return truncate(String(args.text ?? ""), 40);
    case "input":
      return truncate(String(args.title ?? "Credentials / Form Input"), 50);
    case "captcha":
      return "Detecting & solving verification challenge";
    case "integration":
      return truncate(String(args.instruction ?? `Switched to ${args.role ?? "specialist"}`), 50);
    default:
      return "";
  }
}

// Hidden internal tools that shouldn't render
const HIDDEN_TOOLS = new Set(["browser_state", "done_autonomous", "todo_write"]);
export function isHiddenTool(name: string): boolean {
  return HIDDEN_TOOLS.has(name);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
