"use client";

import { useCallback, useRef, useState } from "react";
import { PiAgentTitle } from "./PiAgentTitle";

type UpdateState = "idle" | "running" | "done" | "error";

interface PiUpdateResult {
  ok: boolean;
  code: number | null;
  error: string | null;
}

/** Parses the trailing __piUpdateDone JSON marker line from the stream */
function parseDoneMarker(text: string): PiUpdateResult | null {
  const lines = text.trimEnd().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as { __piUpdateDone?: boolean; ok?: boolean; code?: number | null; error?: string | null };
      if (parsed.__piUpdateDone) {
        return { ok: !!parsed.ok, code: parsed.code ?? null, error: parsed.error ?? null };
      }
    } catch {
      // not the marker - keep scanning upward
    }
  }
  return null;
}

interface SidebarHeaderProps {
  selectedCwd: string | null;
  onNewSession?: (sessionId: string, cwd: string) => void;
  loadSessions: (showLoading?: boolean) => Promise<void>;
  sessionRefreshDone: boolean;
}

export function SidebarHeader({
  selectedCwd,
  onNewSession,
  loadSessions,
  sessionRefreshDone,
}: SidebarHeaderProps) {
  const handleNewSession = useCallback(() => {
    if (!selectedCwd) return;
    const tempId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, selectedCwd);
  }, [selectedCwd, onNewSession]);

  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateOutput, setUpdateOutput] = useState("");
  const [updateResult, setUpdateResult] = useState<PiUpdateResult | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const handlePiUpdate = useCallback(async () => {
    if (updateState === "running") return;
    setUpdateState("running");
    setUpdateOutput("");
    setUpdateResult(null);

    try {
      const res = await fetch("/api/pi-update", { method: "POST" });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        // Strip the marker line from what we display
        const display = text.replace(/\n?\{"__piUpdateDone".*\}\s*$/, "");
        setUpdateOutput(display);
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
      const result = parseDoneMarker(text);
      setUpdateResult(result);
      setUpdateState(result?.ok ? "done" : "error");
    } catch (e) {
      setUpdateResult({ ok: false, code: null, error: e instanceof Error ? e.message : String(e) });
      setUpdateState("error");
    }
  }, [updateState]);

  return (
    <div className="p-2.5 pb-[10px] border-b border-divider shrink-0">
      <div className="flex items-center justify-between mb-2.5">
        <PiAgentTitle />
        <div className="flex gap-1.5">
          <button
            onClick={handleNewSession}
            disabled={!selectedCwd}
            aria-label="New session"
            className={`flex items-center justify-center w-8 h-control-height p-0 shrink-0 rounded-control text-[12px] font-medium tracking-normal transition-[background-color,border-color,color,opacity,transform] duration-150 border ${
              selectedCwd
                ? "bg-chrome-button-bg border-border text-text-muted cursor-pointer hover:bg-chrome-button-hover hover:text-accent hover:border-focus-ring active:scale-95"
                : "bg-chrome-button-bg border-border text-text-dim cursor-not-allowed"
            }`}
            title={selectedCwd ? `New session in ${selectedCwd}` : "Select a project first"}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="6" y1="1" x2="6" y2="11" />
              <line x1="1" y1="6" x2="11" y2="6" />
            </svg>
          </button>
          <button
            onClick={() => loadSessions(false)}
            aria-label="Refresh sessions"
            className={`flex items-center justify-center w-8 h-control-height p-0 shrink-0 rounded-control cursor-pointer transition-[background-color,border-color,color,transform] duration-250 border ${
              sessionRefreshDone
                ? "bg-success-bg border-success-border text-success"
                : "bg-chrome-button-bg border-border text-text-muted hover:bg-chrome-button-hover hover:text-accent hover:border-focus-ring"
            }`}
            title="Refresh sessions"
          >
            {sessionRefreshDone ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            )}
          </button>
          <button
            onClick={() => void handlePiUpdate()}
            disabled={updateState === "running"}
            aria-label="Update pi"
            title={updateState === "running" ? "Updating pi…" : "Update pi and extensions (pi update --all)"}
            className={`flex items-center justify-center w-8 h-control-height p-0 shrink-0 rounded-control cursor-pointer transition-[background-color,border-color,color,transform] duration-250 border ${
              updateState === "running"
                ? "bg-chrome-button-bg border-border text-text-dim cursor-wait"
                : updateState === "done"
                ? "bg-success-bg border-success-border text-success"
                : updateState === "error"
                ? "bg-danger-bg border-danger-border text-danger"
                : "bg-chrome-button-bg border-border text-text-muted hover:bg-chrome-button-hover hover:text-accent hover:border-focus-ring"
            }`}
          >
            {updateState === "running" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            ) : updateState === "done" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : updateState === "error" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* pi update output panel */}
      {updateState !== "idle" && (
        <div
          className="mt-1.5 rounded-control border"
          style={{
            borderColor: updateState === "error" ? "var(--danger-border)" : "var(--border)",
            background: "var(--bg-subtle)",
          }}
        >
          <div className="flex items-center justify-between px-2 py-1 border-b" style={{ borderColor: "var(--divider)" }}>
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.04em]"
              style={{
                color:
                  updateState === "error" ? "var(--danger)" : updateState === "done" ? "var(--success)" : "var(--text-muted)",
              }}
            >
              {updateState === "running"
                ? "pi update --all …"
                : updateState === "done"
                ? "Update finished"
                : updateResult?.error || "Update failed"}
            </span>
            <button
              onClick={() => {
                setUpdateState("idle");
                setUpdateOutput("");
                setUpdateResult(null);
              }}
              aria-label="Close update panel"
              className="flex items-center justify-center w-4 h-4 p-0 bg-transparent border-none rounded-[3px] text-text-dim hover:text-text cursor-pointer shrink-0"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="5" y1="5" x2="19" y2="19" />
                <line x1="19" y1="5" x2="5" y2="19" />
              </svg>
            </button>
          </div>
          <div
            ref={outputRef}
            className="px-2 py-1.5 font-mono text-[10px] leading-[1.5] whitespace-pre-wrap overflow-y-auto"
            style={{ color: "var(--text-muted)", maxHeight: 120 }}
          >
            {updateOutput || "…"}
          </div>
          {updateState === "done" && (
            <div className="px-2 py-1 border-t text-[10px]" style={{ borderColor: "var(--divider)", color: "var(--text-dim)" }}>
              Restart the app to use the new version.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
