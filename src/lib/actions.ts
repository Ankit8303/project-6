"use server";

import { getOrCreateSession, getSession, closeSession, screenshotCache } from "./stagehand-session";
import { bbClient } from "./api";
import type { Profile } from "./types";

export async function createSession(opts: {
  model?: string;
  profileId?: string;
  workspaceId?: string;
  proxyCountryCode?: string;
  enableRecording?: boolean;
}) {
  const sessionId = "sess_" + Math.random().toString(36).slice(2, 11);
  const session = await getOrCreateSession(sessionId, {
    model: opts.model,
    proxies: !!opts.proxyCountryCode,
  });

  return {
    id: session.id,
    liveUrl: session.liveUrl,
    status: session.status,
  };
}

export async function getSessionStatus(id: string) {
  const session = getSession(id);
  const cachedScreenshot = screenshotCache.get(id);

  if (!session) {
    if (cachedScreenshot) {
      return {
        id,
        status: "stopped" as const,
        output: null,
        liveUrl: null,
        screenshot: `data:image/png;base64,${cachedScreenshot}`,
      };
    }
    return null;
  }
  return {
    id: session.id,
    status: session.status,
    output: session.output,
    liveUrl: session.liveUrl,
    screenshot: (session.lastScreenshot || cachedScreenshot)
      ? `data:image/png;base64,${session.lastScreenshot || cachedScreenshot}`
      : null,
  };
}

export async function stopTask(id: string) {
  await closeSession(id);
}

export async function waitForRecording(id: string) {
  const session = getSession(id);
  if (session?.recordingUrls && session.recordingUrls.length > 0) {
    return session.recordingUrls;
  }
  if (session?.browser.sessionId && bbClient) {
    try {
      const bbSession = await bbClient.sessions.retrieve(session.browser.sessionId);
      if (bbSession && (bbSession as any).recordingUrl) {
        return [(bbSession as any).recordingUrl];
      }
    } catch {
      // ignore
    }
  }
  return [];
}

export async function listProfiles(): Promise<Profile[]> {
  return [];
}

export async function listWorkspaces() {
  if (!bbClient) return [];
  try {
    const projects = await bbClient.projects.list();
    return projects.map((p) => ({
      id: p.id,
      name: p.name ?? `Project ${p.id.slice(0, 6)}`,
      createdAt: (p as any).createdAt ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}
