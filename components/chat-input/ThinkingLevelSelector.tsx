"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../I18nProvider";

const THINKING_LEVELS = ["auto", "off", "minimal", "low", "medium", "high", "xhigh"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

interface ThinkingLevelSelectorProps {
  isStreaming: boolean;
  thinkingLevel?: ThinkingLevel | null;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
}

export function ThinkingLevelSelector({
  isStreaming,
  thinkingLevel,
  availableThinkingLevels,
  thinkingLevelMap,
  onThinkingLevelChange,
}: ThinkingLevelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<{ top: number; right: number } | null>(null);
  const { t } = useI18n();

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const current = thinkingLevel ?? "auto";
  const currentMapped = current !== "auto" && thinkingLevelMap ? thinkingLevelMap[current] : undefined;
  const currentLabel = currentMapped != null ? currentMapped : current;

  // Close on outside click or Escape.
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!onThinkingLevelChange) return null;

  const levels = THINKING_LEVELS.filter((lvl) => {
    if (!availableThinkingLevels) return true;
    if (lvl === "auto") return true;
    return availableThinkingLevels.includes(lvl);
  });

  return (
    <div ref={triggerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPanelRect({ top: rect.top, right: rect.right });
          setOpen((v) => !v);
        }}
        disabled={isStreaming}
        title={t("chat.thinkingLevel")}
        aria-label={t("chat.thinkingLevelAria", { level: currentLabel })}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 12px",
          height: "var(--control-height)",
          background: open ? "var(--bg-hover)" : "none",
          border: "none",
          borderRadius: "var(--radius-control)",
          color: "var(--text-muted)",
          cursor: isStreaming ? "not-allowed" : "pointer",
          fontSize: 12,
          opacity: isStreaming ? 0.5 : 1,
        }}
        className={isStreaming ? "" : "hover:bg-[var(--bg-hover)] hover:text-[var(--text)] active:scale-95 transition-[background-color,color,transform] duration-150"}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.7.78 3.21 2 4.21V14a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-2.29c1.22-1 2-2.51 2-4.21A5.5 5.5 0 0 0 9.5 2z" />
          <line x1="7" y1="18" x2="12" y2="18" />
          <line x1="8" y1="21" x2="11" y2="21" />
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentLabel}
        </span>
      </button>
      {open && panelRect && (() => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const bottom = viewportHeight - panelRect.top + 6;
        const maxH = Math.max(120, Math.min(panelRect.top - 8, viewportHeight * 0.6));
        return (
          <div
            ref={panelRef}
            className="t-dropdown is-open material-popover"
            data-origin="bottom-right"
            style={{
              position: "fixed",
              bottom,
              right: viewportWidth - panelRect.right,
              zIndex: 500,
              background: "var(--material-popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-panel)",
              boxShadow: "var(--shadow-popover)",
              overflow: "hidden",
              minWidth: 240,
              maxHeight: maxH,
              overflowY: "auto",
            }}
          >
            {levels.map((lvl) => {
              const isActive = current === lvl;
              const desc = t(`thinking.${lvl}.desc`);
              const mappedVal = lvl !== "auto" && thinkingLevelMap ? thinkingLevelMap[lvl] : undefined;
              const displayLabel = mappedVal != null ? mappedVal : lvl;
              const showOriginal = mappedVal != null && mappedVal !== lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => { setOpen(false); if (!isActive) onThinkingLevelChange(lvl); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "7px 12px",
                    background: isActive ? "var(--bg-selected)" : "none",
                    border: "none",
                    color: isActive ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer", fontSize: 12, textAlign: "left",
                    fontWeight: isActive ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}
                  className={isActive ? "" : "hover:bg-[var(--bg-hover)] transition-colors duration-150"}
                >
                  {isActive
                    ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                    : <span style={{ width: 10, flexShrink: 0 }} />}
                  <span style={{ flex: 1 }}>
                    {displayLabel}
                    {showOriginal && <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginLeft: 5 }}>({lvl})</span>}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 8 }}>{desc}</span>
                </button>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
