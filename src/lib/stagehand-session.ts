import { browserbase, localBrowser, Stagehand, type StagehandBrowser } from "@browserbasehq/stagehand";
import { bbClient, BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID } from "./api";
import { tool } from "ai";
import { z } from "zod";
import { handleCaptchaResolution } from "./captcha-solver";
import type { MessageResponse, AgentRole, InputRequestField } from "./types";

export interface PendingInputRequest {
  requestId: string;
  title: string;
  description?: string;
  fields: InputRequestField[];
  agentRole?: AgentRole;
  resolve: (values: Record<string, string>) => void;
  reject: (err: Error) => void;
}

export interface ManagedSession {
  id: string;
  browser: StagehandBrowser;
  stagehand: Stagehand;
  liveUrl: string | null;
  status: "created" | "running" | "idle" | "waiting_input" | "completed" | "error" | "stopped";
  output?: unknown;
  lastScreenshot?: string;
  messages: MessageResponse[];
  recordingUrls?: string[];
  createdAt: number;
  activeAgentRole?: AgentRole;
  pendingInputRequest?: PendingInputRequest | null;
  onStreamEvent?: (payload: unknown) => void;
}

// Global in-memory session registry and screenshot cache across hot-reloads and requests
declare global {
  // eslint-disable-next-line no-var
  var __stagehand_sessions: Map<string, ManagedSession> | undefined;
  // eslint-disable-next-line no-var
  var __stagehand_screenshots: Map<string, string> | undefined;
}

const sessionStore: Map<string, ManagedSession> =
  globalThis.__stagehand_sessions ?? new Map<string, ManagedSession>();
globalThis.__stagehand_sessions = sessionStore;

export const screenshotCache: Map<string, string> =
  globalThis.__stagehand_screenshots ?? new Map<string, string>();
globalThis.__stagehand_screenshots = screenshotCache;

export async function getOrCreateSession(
  sessionId: string,
  options?: {
    model?: string;
    proxies?: boolean;
    region?: string;
    userMetadata?: Record<string, unknown>;
  },
): Promise<ManagedSession> {
  const existing = sessionStore.get(sessionId);
  if (existing && !existing.browser.closed && existing.stagehand.initialized) {
    return existing;
  }

  let browser: StagehandBrowser;
  let liveUrl: string | null = null;

  if (BROWSERBASE_API_KEY) {
    try {
      browser = await browserbase.launch({
        apiKey: BROWSERBASE_API_KEY,
        projectId: BROWSERBASE_PROJECT_ID || undefined,
        keepAlive: true,
        proxies: options?.proxies ?? false,
        region: (options?.region as any) ?? "us-west-2",
        userMetadata: {
          app: "agent-chat-ui",
          sessionId,
          ...(options?.userMetadata ?? {}),
        },
      });

      if (browser.sessionId && bbClient) {
        try {
          const debugData = await bbClient.sessions.debug(browser.sessionId);
          liveUrl =
            debugData.debuggerFullscreenUrl || debugData.debuggerUrl || null;
        } catch (err) {
          console.warn("Could not retrieve Browserbase debug URL:", err);
        }
      }
    } catch (err) {
      console.warn("Failed to launch Browserbase browser, falling back to local:", err);
      browser = await localBrowser.launch({
        keepAlive: true,
        headless: process.env.STAGEHAND_HEADED === "true" ? false : true,
      });
    }
  } else {
    browser = await localBrowser.launch({
      keepAlive: true,
      headless: process.env.STAGEHAND_HEADED === "true" ? false : true,
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  let modelConfig: { modelName: any; apiKey?: string } | undefined;
  if (openaiKey) {
    modelConfig = {
      modelName: (process.env.STAGEHAND_MODEL_NAME as any) || "openai/gpt-4o",
      apiKey: openaiKey,
    };
  } else if (geminiKey) {
    const rawName =
      process.env.STAGEHAND_MODEL_NAME ||
      process.env.GEMINI_MODEL_NAME ||
      "gemini-3-flash-preview";
    const modelName = rawName.startsWith("google/")
      ? rawName
      : `google/${rawName}`;
    modelConfig = {
      modelName: modelName as any,
      apiKey: geminiKey,
    };
  }

  const stagehand = await Stagehand.create({
    browser,
    ...(modelConfig ? { model: modelConfig } : {}),
  });

  const managed: ManagedSession = {
    id: sessionId,
    browser,
    stagehand,
    liveUrl,
    status: "created",
    messages: [],
    createdAt: Date.now(),
  };

  sessionStore.set(sessionId, managed);
  return managed;
}

export function getSession(sessionId: string): ManagedSession | undefined {
  return sessionStore.get(sessionId);
}

/**
 * Independent teardown: Stagehand and browser cleanup are attempted separately so
 * one failure cannot mask the other.
 */
export async function closeSession(
  sessionId: string,
): Promise<{ success: boolean; cleanupErrors?: Error[] }> {
  const session = sessionStore.get(sessionId);
  if (!session) return { success: true };

  const cleanupErrors: Error[] = [];

  // Capture final screenshot before closing browser
  if (session.browser && !session.browser.closed) {
    try {
      const [page] = await session.browser.context.pages();
      if (page) {
        const buf = await page.screenshot();
        const base64 = Buffer.from(buf).toString("base64");
        session.lastScreenshot = base64;
        screenshotCache.set(sessionId, base64);
      }
    } catch {
      // ignore
    }
  }

  if (session.stagehand && session.stagehand.initialized) {
    try {
      await session.stagehand.close();
    } catch (err) {
      cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (session.browser && !session.browser.closed) {
    try {
      await session.browser.close();
    } catch (err) {
      cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  session.status = "stopped";
  if (session.lastScreenshot) {
    screenshotCache.set(sessionId, session.lastScreenshot);
  }

  if (cleanupErrors.length > 0) {
    return { success: false, cleanupErrors };
  }
  return { success: true };
}

export async function captureCurrentScreenshot(
  sessionId: string,
): Promise<string | null> {
  const session = sessionStore.get(sessionId);
  if (!session || session.browser.closed) {
    return screenshotCache.get(sessionId) ?? null;
  }
  try {
    const [page] = await session.browser.context.pages();
    if (!page) return screenshotCache.get(sessionId) ?? null;
    const buf = await page.screenshot();
    const base64 = Buffer.from(buf).toString("base64");
    session.lastScreenshot = base64;
    screenshotCache.set(sessionId, base64);
    return base64;
  } catch {
    return screenshotCache.get(sessionId) ?? null;
  }
}

/**
 * Builds the Vercel AI SDK registered tool contract backed by the shared Stagehand instance.
 */
export function createStagehandTools(stagehand: Stagehand, session?: ManagedSession) {
  return {
    browser_navigate: tool({
      description: "Navigate the active browser page to a specific URL",
      inputSchema: z.object({
        url: z.string().describe("The full URL to navigate to, e.g. https://news.ycombinator.com"),
      }),
      execute: async ({ url }: { url: string }) => {
        const [page] = await stagehand.browser.context.pages();
        if (!page) {
          throw new Error("No active page found in browser context");
        }
        const normalizedUrl =
          url.startsWith("http://") || url.startsWith("https://")
            ? url
            : `https://${url}`;
        await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        const title = await page.title();
        const currentUrl = await page.url();
        if (session) {
          try {
            const buf = await page.screenshot();
            session.lastScreenshot = Buffer.from(buf).toString("base64");
          } catch {}
        }
        return {
          success: true,
          url: currentUrl,
          title,
        };
      },
    }),

    browser_act: tool({
      description:
        "Perform a natural language browser action on the current page (e.g. 'Click the submit button', 'Type hello into the search box')",
      inputSchema: z.object({
        instruction: z.string().describe("Natural language instruction for the action"),
      }),
      execute: async ({ instruction }: { instruction: string }) => {
        const res = await stagehand.act(instruction);
        if (session) {
          try {
            const [p] = await stagehand.browser.context.pages();
            if (p) {
              const buf = await p.screenshot();
              session.lastScreenshot = Buffer.from(buf).toString("base64");
            }
          } catch {}
        }
        return {
          success: res.data.success,
          message: res.data.message ?? "Action completed",
        };
      },
    }),

    browser_extract: tool({
      description:
        "Extract structured data or answers from the active page using natural language",
      inputSchema: z.object({
        instruction: z.string().describe("What information to extract from the page"),
      }),
      execute: async ({ instruction }: { instruction: string }) => {
        const res = await stagehand.extract(instruction);
        if (session) {
          try {
            const [p] = await stagehand.browser.context.pages();
            if (p) {
              const buf = await p.screenshot();
              const b64 = Buffer.from(buf).toString("base64");
              session.lastScreenshot = b64;
              screenshotCache.set(session.id, b64);
            }
          } catch {}
        }
        return {
          data: res.data,
        };
      },
    }),

    browser_observe: tool({
      description:
        "Observe the current page to discover interactive elements and executable actions",
      inputSchema: z.object({
        instruction: z
          .string()
          .optional()
          .describe("Optional goal to focus element observation"),
      }),
      execute: async ({ instruction }: { instruction?: string }) => {
        const res = await stagehand.observe(instruction);
        return {
          suggestedActions: res.data.map((a: { description: string; selector: string }) => ({
            description: a.description,
            selector: a.selector,
          })),
        };
      },
    }),

    browser_search: tool({
      description: "Search the web using Browserbase Search API",
      inputSchema: z.object({
        query: z.string().describe("The search term or question"),
      }),
      execute: async ({ query }: { query: string }) => {
        if (BROWSERBASE_API_KEY) {
          const res = await browserbase.search({
            query,
            apiKey: BROWSERBASE_API_KEY,
          });
          return { results: res.results };
        }
        const [page] = await stagehand.browser.context.pages();
        if (page) {
          await page.goto(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            { waitUntil: "domcontentloaded", timeout: 20000 },
          );
          const currentUrl = await page.url();
          if (session) {
            try {
              const buf = await page.screenshot();
              session.lastScreenshot = Buffer.from(buf).toString("base64");
            } catch {}
          }
          return {
            results: [{ title: `DuckDuckGo Search: ${query}`, url: currentUrl }],
          };
        }
        return { results: [] };
      },
    }),

    browser_screenshot: tool({
      description: "Capture a screenshot of the active browser page",
      inputSchema: z.object({}),
      execute: async () => {
        const [page] = await stagehand.browser.context.pages();
        if (!page) throw new Error("No active page for screenshot");
        const buf = await page.screenshot();
        const base64 = Buffer.from(buf).toString("base64");
        if (session) {
          session.lastScreenshot = base64;
        }
        return {
          success: true,
          byteLength: buf.length,
          base64,
        };
      },
    }),

    request_user_input: tool({
      description:
        "Request sensitive credentials (e.g. username, password, 2FA/OTP code) or form values from the user. Suspends execution until the user enters the information in the chat dialog.",
      inputSchema: z.object({
        title: z.string().describe("Title of the request, e.g. 'Authentication Required' or 'Enter Shipping Info'"),
        description: z.string().optional().describe("Explanation of why the input is needed and on what site"),
        fields: z.array(
          z.object({
            name: z.string().describe("Internal field name, e.g. 'username', 'password', 'otp'"),
            label: z.string().describe("User-facing label, e.g. 'Email Address', 'Password'"),
            type: z.enum(["text", "password", "number", "select"]).describe("Input type"),
            placeholder: z.string().optional().describe("Placeholder hint"),
            required: z.boolean().optional().default(true),
            options: z.array(z.string()).optional().describe("Select options if type is select"),
          }),
        ),
      }),
      execute: async ({ title, description, fields }) => {
        if (!session) {
          throw new Error("No active managed session to handle user input request");
        }

        const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        session.status = "waiting_input";

        // Emit stream event to front-end
        if (session.onStreamEvent) {
          session.onStreamEvent({
            inputRequired: {
              requestId,
              title,
              description,
              fields,
              agentRole: session.activeAgentRole || "auth",
            },
          });
        }

        // Return a promise that resolves when the user submits provide-input API
        return new Promise((resolve, reject) => {
          session.pendingInputRequest = {
            requestId,
            title,
            description,
            fields,
            agentRole: session.activeAgentRole,
            resolve: (values) => {
              resolve({
                success: true,
                message: "User provided the requested information successfully.",
                values,
              });
            },
            reject: (err) => {
              reject(err);
            },
          };

          // 3 minute timeout if user doesn't respond
          setTimeout(() => {
            if (session.pendingInputRequest?.requestId === requestId) {
              session.pendingInputRequest = null;
              session.status = "running";
              resolve({
                success: false,
                message: "User input request timed out after 3 minutes.",
                values: {},
              });
            }
          }, 180000);
        });
      },
    }),

    fill_form: tool({
      description:
        "Automatically fill one or more input fields or submit a form using natural language or target selectors",
      inputSchema: z.object({
        fields: z.array(
          z.object({
            labelOrSelector: z.string().describe("The label, placeholder, or selector of the form field"),
            value: z.string().describe("The value to enter into the field"),
          }),
        ),
        submit: z.boolean().optional().describe("Whether to click the submit button after filling"),
        submitLabel: z.string().optional().describe("Text or label of the submit button, e.g. 'Sign in' or 'Register'"),
      }),
      execute: async ({ fields, submit, submitLabel }) => {
        const results: Array<{ field: string; success: boolean }> = [];

        for (const item of fields) {
          try {
            await stagehand.act(`Type "${item.value}" into the field labeled "${item.labelOrSelector}" or matching "${item.labelOrSelector}"`);
            results.push({ field: item.labelOrSelector, success: true });
          } catch {
            results.push({ field: item.labelOrSelector, success: false });
          }
        }

        if (submit) {
          try {
            const btn = submitLabel || "Submit";
            await stagehand.act(`Click the "${btn}" button or form submission button`);
          } catch {}
        }

        if (session) {
          try {
            const [p] = await stagehand.browser.context.pages();
            if (p) {
              const buf = await p.screenshot();
              session.lastScreenshot = Buffer.from(buf).toString("base64");
            }
          } catch {}
        }

        return {
          success: results.every((r) => r.success),
          details: results,
        };
      },
    }),

    solve_captcha: tool({
      description: "Detect and solve CAPTCHAs (reCAPTCHA, Cloudflare Turnstile, hCaptcha) on the current page",
      inputSchema: z.object({
        force: z.boolean().optional().describe("Force check even if not immediately obvious"),
      }),
      execute: async () => {
        const result = await handleCaptchaResolution(
          stagehand,
          session,
          session?.onStreamEvent as any,
        );
        return {
          solved: result.solved,
          method: result.method,
          message: result.solved
            ? "Captcha resolved successfully."
            : "Could not solve captcha or manual intervention timed out.",
        };
      },
    }),

    delegate_to_specialist: tool({
      description: "Delegate part of the task to a specialized agent (e.g. auth specialist for login, form_filler for forms, extractor for scraping)",
      inputSchema: z.object({
        role: z.enum(["auth", "form_filler", "navigator", "extractor"]).describe("The specialized agent to assign"),
        instruction: z.string().describe("Clear instructions for the specialist agent"),
      }),
      execute: async ({ role, instruction }) => {
        if (session) {
          session.activeAgentRole = role as AgentRole;
          if (session.onStreamEvent) {
            session.onStreamEvent({
              agentSwitched: {
                role,
                name: role.toUpperCase(),
                task: instruction,
              },
            });
          }
        }
        return {
          success: true,
          activeRole: role,
          message: `Control delegated to ${role} specialist with instruction: "${instruction}"`,
        };
      },
    }),
  };
}

export function provideSessionInput(
  sessionId: string,
  requestId: string,
  values: Record<string, string>,
): boolean {
  const session = sessionStore.get(sessionId);
  if (!session || !session.pendingInputRequest) {
    return false;
  }
  if (session.pendingInputRequest.requestId !== requestId) {
    return false;
  }
  session.pendingInputRequest.resolve(values);
  session.pendingInputRequest = null;
  session.status = "running";
  return true;
}
