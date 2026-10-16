import type { Stagehand } from "@browserbasehq/stagehand";
import type { ManagedSession } from "./stagehand-session";

export interface CaptchaDetectionResult {
  detected: boolean;
  type?: "recaptcha" | "hcaptcha" | "cloudflare" | "geetest" | "generic";
  selector?: string;
  reason?: string;
}

export async function detectCaptcha(stagehand: Stagehand): Promise<CaptchaDetectionResult> {
  try {
    const [page] = await stagehand.browser.context.pages();
    if (!page) return { detected: false };

    const detection = await page.evaluate(() => {
      // 1. Check for Cloudflare Turnstile / Challenge
      if (
        document.querySelector("iframe[src*='challenges.cloudflare.com']") ||
        document.querySelector("#cf-turnstile") ||
        document.querySelector(".cf-turnstile") ||
        document.querySelector("#challenge-running") ||
        document.querySelector("#challenge-stage")
      ) {
        return {
          detected: true,
          type: "cloudflare" as const,
          reason: "Cloudflare Turnstile or Security Challenge detected",
        };
      }

      // 2. Check for Google reCAPTCHA
      if (
        document.querySelector("iframe[src*='recaptcha']") ||
        document.querySelector(".g-recaptcha") ||
        document.querySelector("#g-recaptcha-response")
      ) {
        return {
          detected: true,
          type: "recaptcha" as const,
          reason: "Google reCAPTCHA widget detected",
        };
      }

      // 3. Check for hCaptcha
      if (
        document.querySelector("iframe[src*='hcaptcha.com']") ||
        document.querySelector(".h-captcha") ||
        document.querySelector("div[data-sitekey][class*='hcaptcha']")
      ) {
        return {
          detected: true,
          type: "hcaptcha" as const,
          reason: "hCaptcha widget detected",
        };
      }

      // 4. Check for text indicators
      const bodyText = (document.body?.innerText || "").toLowerCase();
      if (
        bodyText.includes("verify you are human") ||
        bodyText.includes("checking if the site connection is secure") ||
        bodyText.includes("please complete the security check to access")
      ) {
        return {
          detected: true,
          type: "generic" as const,
          reason: "Human verification or security challenge text detected",
        };
      }

      return { detected: false };
    });

    return detection;
  } catch {
    return { detected: false };
  }
}

export async function handleCaptchaResolution(
  stagehand: Stagehand,
  session?: ManagedSession,
  onNotify?: (event: { detected: boolean; message: string; autoSolving: boolean }) => void,
): Promise<{ solved: boolean; method?: "automated" | "manual" | "none" }> {
  const check = await detectCaptcha(stagehand);
  if (!check.detected) {
    return { solved: true, method: "none" };
  }

  // 1. Notify that captcha was detected and auto-solve is beginning
  if (onNotify) {
    onNotify({
      detected: true,
      message: `${check.reason || "CAPTCHA detected"}. Attempting automated bypass...`,
      autoSolving: true,
    });
  }

  // 2. Automated solve attempt via Stagehand act
  try {
    await stagehand.act("Click the verify you are human checkbox or solve the captcha puzzle");
    // Wait for challenge transition
    await new Promise((r) => setTimeout(r, 3000));

    const recheck = await detectCaptcha(stagehand);
    if (!recheck.detected) {
      if (onNotify) {
        onNotify({
          detected: false,
          message: "CAPTCHA solved successfully!",
          autoSolving: false,
        });
      }
      return { solved: true, method: "automated" };
    }
  } catch (err) {
    console.warn("Auto-solve attempt encountered an issue:", err);
  }

  // 3. Fallback: Prompt user to solve in the live browser panel
  if (onNotify) {
    onNotify({
      detected: true,
      message: "Human verification required. Please click or solve the CAPTCHA in the live browser on the right. Resuming automatically when verified...",
      autoSolving: false,
    });
  }

  // Poll for up to 30 seconds to see if user solved it in live browser
  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    await new Promise((r) => setTimeout(r, 2000));
    const stillPresent = await detectCaptcha(stagehand);
    if (!stillPresent.detected) {
      if (onNotify) {
        onNotify({
          detected: false,
          message: "Verification complete! Continuing automated workflow...",
          autoSolving: false,
        });
      }
      return { solved: true, method: "manual" };
    }
  }

  return { solved: false, method: "none" };
}
