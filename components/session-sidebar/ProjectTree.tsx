"use client";

import React from "react";
import { openDirectoryInFileManager, pathBasename } from "./helpers";
import { useI18n } from "../I18nProvider";
import type { GitBranchesState } from "./use-git-branches";

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
  /** Controlled set of expanded project cwds */
  expanded: Set<string>;
  onExpandedChange: (next: Set<string>) => void;
  /** Git branch state for the selected project (see useGitBranches) */
  gitBranches?: GitBranchesState;
}

export function ProjectTree({ cwds, selectedCwd, onSelect, renderProject, sessionCounts, expanded, onExpandedChange, gitBranches }: ProjectTreeProps) {
  const [openError, setOpenError] = React.useState<string | null>(null);
  const { t } = useI18n();

  // Transient success flash after a completed git fetch
  const [fetchDone, setFetchDone] = React.useState(false);
  const fetchDoneTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (fetchDoneTimerRef.current) clearTimeout(fetchDoneTimerRef.current);
  }, []);

  const handleFetch = async () => {
    if (!gitBranches || gitBranches.busy) return;
    const ok = await gitBranches.fetchRemote();
    setFetchDone(ok);
    if (fetchDoneTimerRef.current) clearTimeout(fetchDoneTimerRef.current);
    fetchDoneTimerRef.current = setTimeout(() => setFetchDone(false), 2500);
  };

  const toggle = (cwd: string) => {
    const next = new Set(expanded);
    if (next.has(cwd)) next.delete(cwd);
    else next.add(cwd);
    onExpandedChange(next);
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
              className={`group flex items-center gap-[5px] w-full pr-2.5 border-none text-left text-[11px] font-mono cursor-pointer ${
                isSelected ? "bg-bg-selected text-text" : "bg-transparent text-text-muted hover:bg-bg-hover"
              }`}
              style={{ paddingLeft: 12 }}
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

              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" className="shrink-0 text-text-dim">
                <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
              </svg>

              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap py-[6px]">{pathBasename(cwd)}</span>

              {isSelected && gitBranches?.isGit && gitBranches.current && (
                <div className="shrink-0 flex items-center gap-[3px]">
                  <span
                    className="flex items-center gap-[3px] max-w-[110px] h-[16px] px-[5px] bg-transparent border border-[var(--border)] rounded-full text-[9px] font-mono text-text-dim"
                    title={gitBranches.current}
                  >
                    <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
                      <circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="8" r="2" />
                      <path d="M4 6v4M12 10c0-2-2-2-4-2" />
                    </svg>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{gitBranches.current}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFetch();
                    }}
                    disabled={gitBranches.busy}
                    aria-label={t("git.fetch")}
                    title={t("git.fetch")}
                    className={`flex items-center justify-center w-[16px] h-[16px] p-0 shrink-0 bg-transparent border-none rounded-full text-text-dim hover:text-text hover:bg-bg-hover disabled:cursor-wait cursor-pointer transition-opacity duration-150 ${
                      gitBranches.busy || fetchDone ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {gitBranches.busy ? (
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="animate-spin" style={{ transformOrigin: "center" }}>
                        <path d="M14 8a6 6 0 1 1-2-4.47" />
                      </svg>
                    ) : fetchDone ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1.5 5 4 7.5 8.5 2.5" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 8a6 6 0 1 1-2-4.47" />
                        <polyline points="14 1 14 4.5 10.5 4.5" />
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {count !== undefined && count > 0 && (
                <span className={`shrink-0 text-[10px] tabular-nums ${isSelected ? "text-text-muted" : "text-text-dim"}`}>
                  {count}
                </span>
              )}

              {/* Reveal in Finder / Explorer - visible on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenError(null);
                  openDirectoryInFileManager(cwd).catch((err) => {
                    setOpenError(err instanceof Error ? err.message : String(err));
                  });
                }}
                aria-label={t("project.openInFileManager")}
                title={t("project.openInFileManagerIn", { path: cwd })}
                className="flex items-center justify-center w-[18px] h-[18px] p-0 shrink-0 bg-transparent border-none rounded-[3px] text-text-dim hover:text-text hover:bg-chrome-button-hover cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                  <path d="M9 14l3-3 3 3" />
                  <line x1="12" y1="11" x2="12" y2="16" />
                </svg>
              </button>
            </div>

            {isSelected && openError && (
              <div className="px-2.5 pb-1.5 text-[11px]" style={{ color: "var(--danger)", marginLeft: 12 }}>
                {openError}
              </div>
            )}

            {isSelected && gitBranches?.error && (
              <div
                className="px-2.5 pb-1.5 text-[10px] break-all"
                style={{ color: "var(--danger)", marginLeft: 12 }}
                title={gitBranches.error}
              >
                {t("git.fetchError")}
              </div>
            )}

            {isOpen && renderProject ? renderProject(cwd) : null}
          </div>
        );
      })}
    </div>
  );
}
