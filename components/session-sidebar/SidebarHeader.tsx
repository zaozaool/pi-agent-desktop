"use client";

import { useCallback } from "react";
import { PiAgentTitle } from "./PiAgentTitle";

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
            title="Refresh"
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
        </div>
      </div>
    </div>
  );
}
