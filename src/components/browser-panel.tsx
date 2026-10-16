"use client";

import { useMemo, useState } from "react";
import type { ConversationTurn } from "@/lib/types";
import { Globe, ExternalLink, Loader2, Maximize2, Minimize2, Monitor, MousePointerClick, RotateCw } from "lucide-react";

interface BrowserPanelProps {
  liveUrl?: string | null;
  screenshot?: string | null;
  sessionId?: string;
  isBusy?: boolean;
  turns: ConversationTurn[];
  isSessionEnded: boolean;
}

/** Extract the last browsed URL from turns. */
function extractCurrentUrl(turns: ConversationTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    for (let j = turn.steps.length - 1; j >= 0; j--) {
      const tcs = turn.steps[j].toolCalls;
      for (let k = tcs.length - 1; k >= 0; k--) {
        if (tcs[k].type === "browse" && tcs[k].displayValue) {
          return tcs[k].displayValue;
        }
      }
    }
  }
  return "";
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname;
  } catch {
    return url || "browser";
  }
}

export function BrowserPanel({
  liveUrl,
  screenshot,
  sessionId,
  isBusy,
  turns,
  isSessionEnded,
}: BrowserPanelProps) {
  const currentUrl = useMemo(() => extractCurrentUrl(turns), [turns]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // If there's an active liveUrl (Browserbase cloud debugger iframe)
  if (liveUrl) {
    return (
      <div
        className={`flex flex-col h-full bg-zinc-950 border-l border-zinc-800 transition-all ${
          isFullscreen ? "fixed inset-0 z-50 border-l-0" : ""
        }`}
      >
        {/* Header */}
        <div className="h-11 border-b border-zinc-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Monitor size={15} className="text-zinc-400" />
            <span className="text-[13px] font-medium text-zinc-300">
              Agent&apos;s Browser
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Cloud Live
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              <MousePointerClick size={11} className="text-indigo-400" />
              Dual-Control Active
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              title="Reload interactive frame"
            >
              <RotateCw size={13} />
            </button>
            {currentUrl && (
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                title="Open in new tab"
              >
                <ExternalLink size={14} />
              </a>
            )}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* URL bar */}
        <div className="h-8 border-b border-zinc-800 flex items-center justify-between px-4 gap-2 bg-zinc-900/60">
          <div className="flex items-center gap-2 min-w-0">
            <Globe size={13} className="text-zinc-500 shrink-0" />
            <span className="text-[11px] text-zinc-400 truncate">
              {isSessionEnded && !currentUrl ? "Session ended" : currentUrl || "Waiting for agent…"}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 shrink-0 hidden sm:inline">
            Click or type anytime to interact
          </span>
        </div>

        {/* Browser iframe */}
        <div className="flex-1 bg-zinc-900 relative overflow-hidden">
          <iframe
            key={iframeKey}
            src={liveUrl}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write; camera; microphone; autoplay; fullscreen"
          />
        </div>
      </div>
    );
  }

  // Local Browser with live screenshot stream / capture
  const displayScreenshot = screenshot;

  return (
    <div
      className={`flex flex-col h-full bg-zinc-950 border-l border-zinc-800 transition-all ${
        isFullscreen ? "fixed inset-0 z-50 border-l-0" : ""
      }`}
    >
      {/* Header */}
      <div className="h-11 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Monitor size={15} className="text-zinc-400" />
          <span className="text-[13px] font-medium text-zinc-300">
            Agent&apos;s Browser
          </span>
          {displayScreenshot ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isBusy ? "bg-amber-400 animate-ping" : "bg-blue-400"
                }`}
              />
              {isBusy ? "Browsing Live" : "Page View"}
            </span>
          ) : isBusy ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              Connecting…
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {displayScreenshot && (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              <Maximize2 size={14} />
            </button>
          )}
          {currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              title="Open current page in new tab"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>

      {/* URL bar */}
      <div className="h-8 border-b border-zinc-800 flex items-center justify-between px-4 gap-2 bg-zinc-900/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={13} className="text-zinc-500 shrink-0" />
          <span className="text-[11px] text-zinc-300 font-mono truncate">
            {currentUrl || (isSessionEnded ? "Session ended" : "Waiting for agent to browse…")}
          </span>
        </div>
        {isBusy && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-400 shrink-0 font-medium">
            <Loader2 size={12} className="animate-spin" />
            <span>Agent navigating</span>
          </div>
        )}
      </div>

      {/* Main Viewport */}
      <div className="flex-1 bg-zinc-900/80 relative overflow-y-auto flex flex-col items-center justify-start p-3">
        {displayScreenshot ? (
          <div className="w-full flex flex-col items-center">
            {/* Browser window frame mock */}
            <div className="w-full rounded-lg overflow-hidden border border-zinc-700/60 shadow-2xl bg-zinc-950">
              <div className="h-6 bg-zinc-800/80 border-b border-zinc-700/50 flex items-center px-3 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <span className="text-[10px] text-zinc-400 ml-2 font-mono truncate">
                  {getDomain(currentUrl)}
                </span>
              </div>
              <img
                src={displayScreenshot}
                alt="Active browser page"
                className="w-full h-auto object-contain block select-none"
              />
            </div>
            {isSessionEnded && (
              <p className="mt-3 text-xs text-zinc-500">
                Final browser state for this session
              </p>
            )}
          </div>
        ) : isBusy ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-300">
                {currentUrl ? `Loading ${getDomain(currentUrl)}…` : "Agent is launching browser…"}
              </p>
              <p className="text-xs text-zinc-500 max-w-xs">
                Capturing initial viewport. The page will appear here momentarily.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
            <div className="w-12 h-12 rounded-xl bg-zinc-800/60 border border-zinc-700/40 flex items-center justify-center text-zinc-500">
              <Globe size={24} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-400">
                {isSessionEnded
                  ? "Session has ended"
                  : "Browser will appear here when the agent starts browsing"}
              </p>
              <p className="text-xs text-zinc-600 max-w-xs">
                As soon as the agent navigates, clicks, or inspects a web page, the live page view will render right here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
