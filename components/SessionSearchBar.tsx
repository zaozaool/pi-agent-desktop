"use client";

import { useEffect, useRef } from "react";

interface SessionSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  matchCount: number;
  matchPosition: number; // 1-based; 0 when no match
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * In-session find bar (Cmd/Ctrl+F). Floating panel pinned to the top-right of
 * the chat area. Enter / Shift+Enter cycle matches; Esc closes.
 */
export function SessionSearchBar({
  query,
  onQueryChange,
  matchCount,
  matchPosition,
  onPrev,
  onNext,
  onClose,
}: SessionSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="material-popover absolute right-4 top-2 z-50 flex items-center gap-1 rounded-control border border-border bg-bg-elevated px-1.5 py-1 shadow-popover"
      role="search"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ml-1 shrink-0 text-text-dim"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </svg>

      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="搜索当前会话…"
        aria-label="搜索当前会话"
        spellCheck={false}
        className="h-7 w-52 border-none bg-transparent px-1.5 text-[12px] text-text outline-none placeholder:text-text-dim"
      />

      <span className="min-w-[52px] shrink-0 text-center text-[11px] tabular-nums text-text-muted select-none">
        {query.trim() ? (matchCount > 0 ? `${matchPosition} / ${matchCount}` : "0 / 0") : ""}
      </span>

      <div className="flex items-center">
        <button
          onClick={onPrev}
          disabled={matchCount === 0}
          aria-label="上一个匹配"
          title="上一个匹配 (Shift+Enter)"
          className={`flex h-6 w-6 items-center justify-center rounded-[4px] border-none p-0 ${
            matchCount > 0
              ? "bg-transparent text-text-muted hover:bg-bg-hover hover:text-text cursor-pointer"
              : "bg-transparent text-text-dim"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          onClick={onNext}
          disabled={matchCount === 0}
          aria-label="下一个匹配"
          title="下一个匹配 (Enter)"
          className={`flex h-6 w-6 items-center justify-center rounded-[4px] border-none p-0 ${
            matchCount > 0
              ? "bg-transparent text-text-muted hover:bg-bg-hover hover:text-text cursor-pointer"
              : "bg-transparent text-text-dim"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          onClick={onClose}
          aria-label="关闭搜索"
          title="关闭 (Esc)"
          className="flex h-6 w-6 items-center justify-center rounded-[4px] border-none bg-transparent p-0 text-text-muted hover:bg-bg-hover hover:text-text cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
