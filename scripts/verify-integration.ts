import assert from "node:assert";
import { getOrCreateSession, createStagehandTools, closeSession } from "../src/lib/stagehand-session";

async function runVerification() {
  console.log("=== Stagehand v4 Integration Verification ===");
  const testSessionId = `test_sess_${Date.now()}`;
  console.log(`Starting test session: ${testSessionId}`);

  // 1. Session start
  const session = await getOrCreateSession(testSessionId, {
    userMetadata: { setup_verification: testSessionId },
  });
  assert(session, "Session should be created");
  assert(session.browser, "Browser handle should exist");
  assert(session.stagehand, "Stagehand instance should exist");
  assert(session.stagehand.initialized, "Stagehand instance should be initialized");
  console.log("[PASS] Browser and Stagehand session initialized successfully.");

  // 2. Framework tool contract exposure
  const tools = createStagehandTools(session.stagehand);
  const expectedTools = [
    "browser_navigate",
    "browser_act",
    "browser_extract",
    "browser_observe",
    "browser_search",
    "browser_screenshot",
  ];
  for (const tName of expectedTools) {
    assert(tName in tools, `Expected tool '${tName}' to be registered in framework toolset`);
    assert(typeof (tools as any)[tName].execute === "function", `Tool '${tName}' must expose execute function`);
  }
  console.log(`[PASS] Framework exposes expected registered Stagehand tools: ${expectedTools.join(", ")}`);

  // 3. First tool call via framework tool contract: browser_navigate
  console.log("Executing Tool Call 1 via framework contract: browser_navigate to http://localhost:3003");
  const navResult = (await (tools.browser_navigate as any).execute(
    { url: "http://localhost:3003" },
    { toolCallId: "call_1", messages: [] },
  )) as { success: boolean; url: string; title: string };

  assert(navResult.success === true, "browser_navigate should succeed");
  assert(navResult.url.includes("localhost:3003"), `URL should contain localhost:3003, got: ${navResult.url}`);
  console.log(`[PASS] Tool Call 1 completed with deterministic assertion: url='${navResult.url}' title='${navResult.title}'`);

  // 4. Second sequential tool call via framework tool contract: stateful observation
  console.log("Executing Tool Call 2 via framework contract: browser_screenshot & active page inspection");
  const [page] = await session.browser.context.pages();
  assert(page, "Active page must exist");
  const currentUrl = await page.url();
  assert(currentUrl.includes("localhost:3003"), "Sequential call must observe state from Call 1 (URL still localhost:3003)");

  const screenshotResult = (await (tools.browser_screenshot as any).execute(
    {},
    { toolCallId: "call_2", messages: [] },
  )) as { success: boolean; byteLength: number };

  assert(screenshotResult.success === true, "browser_screenshot should succeed on same page");
  assert(screenshotResult.byteLength > 0, "Screenshot should have non-zero bytes");
  console.log(`[PASS] Tool Call 2 verified shared session state: active page is ${currentUrl}, screenshot bytes=${screenshotResult.byteLength}`);

  // 5. Cleanup test: independent guarded teardown
  console.log("Testing cleanup paths...");
  const cleanupResult = await closeSession(testSessionId);
  assert(cleanupResult.success === true, "Cleanup should succeed cleanly");
  assert(session.browser.closed === true, "Browser should be closed");
  assert(!session.stagehand.initialized, "Stagehand should be uninitialized after close");
  console.log("[PASS] Independent cleanup succeeded: Stagehand and browser closed.");

  console.log("=== All verification assertions passed! ===");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
