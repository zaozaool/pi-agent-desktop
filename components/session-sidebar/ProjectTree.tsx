"use client";

import React, { useEffect, useState } from "react";
import { pathBasename } from "./helpers";

interface ProjectTreeProps {
  /** All project directories, most recently active first */
  cwds: string[];
  selectedCwd: string | null;
  /** Project row click: selects the cwd (drives Explorer / New) */
  onSelect: (cwd: string) => void;
  /** Renders the sessions nested under an expanded project node */
  renderProject?: (cwd: string) => React.ReactNode;
  /** Optional session count per cwd, shown right-aligned on project rows */
  sessionCounts?: Record<string, number>;
}

export function ProjectTree({ cwds, selectedCwd, onSelect, renderProject, sessionCounts }: ProjectTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(selectedCwd ? [selectedCwd] : []));

  // Keep the selected project expanded when selection changes from outside
  useEffect(() => {
    if (!selectedCwd) return;
    setExpanded((prev) => (prev.has(selectedCwd) ? prev : new Set([...prev, selectedCwd])));
  }, [selectedCwd]);

  const toggle = (cwd: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  };

  if (cwds.length === 0) return null;

  return (
    <div>
      {cwds.map((cwd) => {
        const isOpen = expanded.has(cwd);
        const isSelected = cwd === selectedCwd;
        const count = sessionCounts?.[cwd];

        return (
          <div key={cwd}>
            <div
              className={`flex items-center gap-[5px] w-full pr-2.5 border-none text-left text-[11px] font-mono cursor-pointer ${
                isSelected ? "bg-bg-selected text-text" : "bg-transparent text-text-muted hover:bg-bg-hover"
              }`}
              style={{ paddingLeft: 8 }}
              title={cwd}
              onClick={() => {
                onSelect(cwd);
                toggle(cwd);
              }}
              role="button"
              aria-expanded={isOpen}
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-text-dim"
                style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }}
              >
                <polyline points="3 1.5 7 5 3 8.5" />
              </svg>

              {isSelected ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <polyline points="1.5 5 4 7.5 8.5 2.5" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" className="shrink-0 text-text-dim">
                  <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                </svg>
              )}

              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap py-[6px]">{pathBasename(cwd)}</span>

              {count !== undefined && count > 0 && (
                <span className={`shrink-0 text-[10px] tabular-nums ${isSelected ? "text-text-muted" : "text-text-dim"}`}>
                  {count}
                </span>
              )}
            </div>

            {isOpen && renderProject ? renderProject(cwd) : null}
          </div>
        );
      })}
    </div>
  );
}
