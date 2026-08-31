"use client";

import { useCallback } from "react";
import { PiAgentTitle } from "./PiAgentTitle";
import { useI18n } from "../I18nProvider";

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
  const { t } = useI18n();

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
      <div className="sidebar-title-row flex items-center justify-between mb-2.5">
        <PiAgentTitle />
        <div className="ml-auto flex gap-1">
          <button
            onClick={handleNewSession}
            disabled={!selectedCwd}
            aria-label={t("sidebar.newSession")}
            className={`sidebar-new-session-button flex h-7 shrink-0 items-center justify-center gap-1 rounded-control border px-2 text-[11px] font-medium tracking-normal transition-[background-color,border-color,color,opacity,transform] duration-150 ${
              selectedCwd
                ? "bg-chrome-button-bg border-border text-text-muted cursor-pointer hover:bg-chrome-button-hover hover:text-accent hover:border-focus-ring active:scale-95"
                : "bg-chrome-button-bg border-border text-text-dim cursor-not-allowed"
            }`}
            title={selectedCwd ? t("sidebar.newSessionIn", { path: selectedCwd }) : t("sidebar.selectProjectFirst")}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="6" y1="1" x2="6" y2="11" />
              <line x1="1" y1="6" x2="11" y2="6" />
            </svg>
            {t("common.new")}
          </button>
          <button
            onClick={() => loadSessions(false)}
            aria-label={t("sidebar.refreshSessions")}
            className={`sidebar-refresh-button flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-control border p-0 transition-[background-color,border-color,color,transform] duration-250 ${
              sessionRefreshDone
                ? "bg-success-bg border-success-border text-success"
                : "bg-chrome-button-bg border-border text-text-muted hover:bg-chrome-button-hover hover:text-accent hover:border-focus-ring"
            }`}
            title={t("common.refresh")}
          >
            {sessionRefreshDone ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
