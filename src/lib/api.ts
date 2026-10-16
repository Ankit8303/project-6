import { browserbase, localBrowser, Stagehand, type StagehandBrowser } from "@browserbasehq/stagehand";
import { Browserbase } from "@browserbasehq/sdk";

// Server-only — never exposed to the browser
export const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY ?? "";
export const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID ?? "";

export const bbClient = BROWSERBASE_API_KEY
  ? new Browserbase({ apiKey: BROWSERBASE_API_KEY })
  : null;

export { browserbase, localBrowser, Stagehand, type StagehandBrowser };
