import { getOrCreateSession, createStagehandTools, closeSession, screenshotCache } from "@/lib/stagehand-session";
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const { task } = await request.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let cancelled = false;
      let primaryError: Error | null = null;
      let cleanupFailed = false;

      request.signal.addEventListener("abort", () => {
        cancelled = true;
        closeSession(sessionId).catch((err) => {
          console.error("Cleanup error on cancel:", err);
        });
      });

      const send = (payload: unknown) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        const session = await getOrCreateSession(sessionId);
        session.status = "running";
        session.activeAgentRole = "supervisor";
        session.onStreamEvent = send;

        // Emit initial user turn
        const userMsgId = `msg_user_${Date.now()}`;
        const userMsg = {
          id: userMsgId,
          role: "user" as const,
          content: task,
          data: { content: task },
          createdAt: new Date().toISOString(),
        };
        session.messages.push(userMsg);
        send({ message: userMsg });

        // Instantiate registered Stagehand tools for the Vercel AI SDK
        const tools = createStagehandTools(session.stagehand, session);

        // Select model provider
        const openaiKey = process.env.OPENAI_API_KEY;
        const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

        if (openaiKey || geminiKey) {
          const google = geminiKey ? createGoogleGenerativeAI({ apiKey: geminiKey }) : null;
          const geminiModels = [
            process.env.GEMINI_MODEL_NAME || "gemini-3-flash-preview",
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash",
            "gemini-3.8-flash",
          ];

          let result: any;
          let stepIndex = 0;

          const executeWithModel = async (modelInstance: any) => {
            stepIndex = 0;
            return await generateText({
              model: modelInstance,
              tools,
              stopWhen: stepCountIs(25),
              abortSignal: request.signal,
              system: `You are an expert autonomous Multi-Agent Browser Automation System powered by Stagehand and Browserbase.
You act as the Supervisor and can orchestrate specialist agents:
- 'auth': For sign-in, login forms, 2FA, password entry, authentication walls.
- 'form_filler': For surveys, checkout forms, registrations, multi-step inputs.
- 'navigator': For searching, exploring links, pagination, and web discovery.
- 'extractor': For harvesting structured data, scraping tables, and compiling final summaries.

Key Capabilities:
1. DELEGATION: Use 'delegate_to_specialist' whenever switching to an auth flow, form filling, deep navigation, or data extraction.
2. AUTHENTICATION & SENSITIVE CREDENTIALS: If a website requires login, password, PIN, or OTP, DO NOT guess credentials. Call 'request_user_input' to prompt the user with a secure in-chat form. Once the user submits, fill the fields with 'fill_form' or 'browser_act'.
3. FORM FILLING: Use 'fill_form' to reliably type into multiple form fields and submit.
4. CAPTCHAS: If you encounter reCAPTCHA, Cloudflare Turnstile, or hCaptcha, call 'solve_captcha'. The system will attempt automated bypass and notify the user if manual interaction in the live browser is required.
5. DUAL-CONTROL: The user has live dual-control over the browser. If the user interacts or logs in manually, observe the new page state with 'browser_observe' or 'browser_extract' and proceed seamlessly.
6. CONCLUDE: Provide a clear, structured Markdown report of the completed actions and findings.`,
              prompt: task,
              onStepFinish: async ({ toolCalls, toolResults, text }) => {
                if (toolCalls && toolCalls.length > 0) {
                  const tcMsgId = `msg_tc_${Date.now()}_${stepIndex}`;
                  const tcMsg = {
                    id: tcMsgId,
                    role: "assistant" as const,
                    agentRole: session.activeAgentRole,
                    data: {
                      content: text || null,
                      agentRole: session.activeAgentRole,
                      tool_calls: toolCalls.map((tc: any) => ({
                        id: tc.toolCallId,
                        type: "function" as const,
                        function: {
                          name: tc.toolName,
                          arguments: JSON.stringify(tc.input ?? tc.args ?? {}),
                        },
                      })),
                    },
                    createdAt: new Date().toISOString(),
                  };
                  session.messages.push(tcMsg);
                  send({ message: tcMsg });

                  if (toolResults && toolResults.length > 0) {
                    for (const tr of toolResults as any[]) {
                      const rawOutput = tr.output ?? tr.result;
                      const resMsg = {
                        id: `msg_res_${tr.toolCallId}`,
                        role: "tool" as const,
                        data: {
                          tool_call_id: tr.toolCallId,
                          content:
                            typeof rawOutput === "string"
                              ? rawOutput
                              : JSON.stringify(rawOutput),
                        },
                        createdAt: new Date().toISOString(),
                      };
                      session.messages.push(resMsg);
                      send({ message: resMsg });
                    }
                  }

                  // Capture live screenshot at step finish if browser has active page
                  try {
                    const [p] = await session.browser.context.pages();
                    if (p) {
                      const buf = await p.screenshot();
                      const b64 = Buffer.from(buf).toString("base64");
                      session.lastScreenshot = b64;
                      screenshotCache.set(sessionId, b64);
                    }
                  } catch {}

                  const stepScreenshot = session.lastScreenshot || screenshotCache.get(sessionId);
                  if (stepScreenshot) {
                    send({ screenshot: `data:image/png;base64,${stepScreenshot}` });
                  }
                }
                stepIndex++;
              },
            });
          };

          if (openaiKey) {
            result = await executeWithModel(openai(process.env.STAGEHAND_MODEL_NAME || "gpt-4o"));
          } else if (google) {
            let lastErr: unknown;
            for (const mName of geminiModels) {
              try {
                result = await executeWithModel(google(mName));
                break;
              } catch (mErr: any) {
                lastErr = mErr;
                const errStr = String(mErr?.message || mErr);
                if (
                  errStr.includes("quota") ||
                  errStr.includes("429") ||
                  errStr.includes("RESOURCE_EXHAUSTED") ||
                  errStr.includes("not found") ||
                  errStr.includes("no longer available")
                ) {
                  console.warn(`Model ${mName} hit quota/availability issue, trying fallback model...`);
                  continue;
                }
                throw mErr;
              }
            }
            if (!result && lastErr) {
              throw lastErr;
            }
          }

          const finalMsgId = `msg_final_${Date.now()}`;
          const finalMsg = {
            id: finalMsgId,
            role: "assistant" as const,
            content: result.text,
            data: { content: result.text },
            createdAt: new Date().toISOString(),
          };
          session.messages.push(finalMsg);
          send({ message: finalMsg });

          session.status = "completed";
          session.output = result.text;
        } else {
          // Model-provider credential unavailable:
          // Invoke the registered tool object's framework-level execution contract directly
          // and report the remaining full-loop gap.
          const urlMatch = task.match(/https?:\/\/[^\s]+/i);
          const targetUrl = urlMatch ? urlMatch[0] : "https://example.com";

          const navToolCallId = `tc_nav_${Date.now()}`;
          const tcMsg = {
            id: `msg_tc_${Date.now()}`,
            role: "assistant" as const,
            data: {
              content: `Navigating to ${targetUrl} via registered Stagehand tool...`,
              tool_calls: [
                {
                  id: navToolCallId,
                  type: "function" as const,
                  function: {
                    name: "browser_navigate",
                    arguments: JSON.stringify({ url: targetUrl }),
                  },
                },
              ],
            },
            createdAt: new Date().toISOString(),
          };
          session.messages.push(tcMsg);
          send({ message: tcMsg });

          // Framework execution contract: tools.browser_navigate.execute(...)
          const navResult = (await (tools.browser_navigate as any).execute(
            { url: targetUrl },
            { toolCallId: navToolCallId, messages: [] },
          )) as { success: boolean; url: string; title: string };

          const toolResMsg = {
            id: `msg_res_${navToolCallId}`,
            role: "tool" as const,
            data: {
              tool_call_id: navToolCallId,
              content: JSON.stringify(navResult),
            },
            createdAt: new Date().toISOString(),
          };
          session.messages.push(toolResMsg);
          send({ message: toolResMsg });

          // Extract basic info using registered Stagehand tool
          const extractToolCallId = `tc_ext_${Date.now()}`;
          const tcExtMsg = {
            id: `msg_tc_ext_${Date.now()}`,
            role: "assistant" as const,
            data: {
              content: "Reading page content with Stagehand extract...",
              tool_calls: [
                {
                  id: extractToolCallId,
                  type: "function" as const,
                  function: {
                    name: "browser_extract",
                    arguments: JSON.stringify({
                      instruction: "Extract the page title, main heading, and a brief description",
                    }),
                  },
                },
              ],
            },
            createdAt: new Date().toISOString(),
          };
          session.messages.push(tcExtMsg);
          send({ message: tcExtMsg });

          const extractResult = (await (tools.browser_extract as any).execute(
            { instruction: "Extract the page title, main heading, and a brief description" },
            { toolCallId: extractToolCallId, messages: [] },
          )) as { data: any };

          const toolExtResMsg = {
            id: `msg_res_${extractToolCallId}`,
            role: "tool" as const,
            data: {
              tool_call_id: extractToolCallId,
              content: JSON.stringify(extractResult),
            },
            createdAt: new Date().toISOString(),
          };
          session.messages.push(toolExtResMsg);
          send({ message: toolExtResMsg });

          const finalReport = `### Stagehand V4 Framework Tool Execution Complete

- **Navigated to:** [${navResult.title || targetUrl}](${targetUrl})
- **Page Title:** ${navResult.title || "N/A"}
- **Extracted Information:**
\`\`\`json
${JSON.stringify(extractResult.data ?? extractResult, null, 2)}
\`\`\`

> **Note on Full Agent Loop:** The Stagehand registered tools (\`browser_navigate\`, \`browser_extract\`, \`browser_act\`, \`browser_observe\`) were executed directly through their framework tool contract. To enable full autonomous multi-step LLM planning loops, configure \`OPENAI_API_KEY\` or \`GEMINI_API_KEY\` in your \`.env.local\`.`;

          const finalMsg = {
            id: `msg_final_${Date.now()}`,
            role: "assistant" as const,
            content: finalReport,
            data: { content: finalReport },
            createdAt: new Date().toISOString(),
          };
          session.messages.push(finalMsg);
          send({ message: finalMsg });

          session.status = "completed";
          session.output = finalReport;
        }

        // Capture final screenshot if still open
        try {
          const [p] = await session.browser.context.pages();
          if (p) {
            const buf = await p.screenshot();
            const b64 = Buffer.from(buf).toString("base64");
            session.lastScreenshot = b64;
            screenshotCache.set(sessionId, b64);
          }
        } catch {}

        const finalScreenshot = session.lastScreenshot || screenshotCache.get(sessionId);
        send({
          session: {
            id: sessionId,
            status: session.status,
            output: session.output,
            liveUrl: session.liveUrl,
            screenshot: finalScreenshot
              ? `data:image/png;base64,${finalScreenshot}`
              : null,
          },
        });
      } catch (err) {
        primaryError = err instanceof Error ? err : new Error(String(err));
        console.error("Task execution error:", primaryError);
        send({ error: primaryError.message, message: primaryError.message });

        // On unrecoverable task failure, attempt cleanup independently
        const cleanupRes = await closeSession(sessionId).catch((cErr) => {
          return { success: false, cleanupErrors: [cErr] };
        });
        if (!cleanupRes.success) {
          cleanupFailed = true;
          console.error("Cleanup errors after failure:", cleanupRes.cleanupErrors);
        }
      } finally {
        if (cleanupFailed) {
          send({
            error: "Session cleanup failed after task error.",
            message: "Session cleanup failed after task error.",
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
