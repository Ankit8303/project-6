import { getSession, captureCurrentScreenshot, screenshotCache } from "@/lib/stagehand-session";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let base64 = screenshotCache.get(id);

  const session = getSession(id);
  if (session) {
    if (!base64 && session.lastScreenshot) {
      base64 = session.lastScreenshot;
    }
    if (!session.browser.closed) {
      try {
        const fresh = await captureCurrentScreenshot(id);
        if (fresh) {
          base64 = fresh;
        }
      } catch {
        // use last cached screenshot
      }
    }
  }

  if (!base64) {
    return new Response(JSON.stringify({ error: "No screenshot available" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const buffer = Buffer.from(base64, "base64");
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
