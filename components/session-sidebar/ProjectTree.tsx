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

  const [branchMenuOpen, setBranchMenuOpen] = React.useState(false);
  const [remoteOpen, setRemoteOpen] = React.useState(false);
  const [branchMenuRect, setBranchMenuRect] = React.useState<{ top: number; left: number } | null>(null);
  const [newBranchName, setNewBranchName] = React.useState("");
  const branchRowRef = React.useRef<HTMLDivElement | null>(null);
  const branchPanelRef = React.useRef<HTMLDivElement | null>(null);
  const newBranchInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!branchMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        branchRowRef.current && !branchRowRef.current.contains(e.target as Node) &&
        branchPanelRef.current && !branchPanelRef.current.contains(e.target as Node)
      ) {
        setBranchMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [branchMenuOpen]);

  // Close the panel and reset the inline form whenever the selection changes
  React.useEffect(() => {
    setBranchMenuOpen(false);
    setNewBranchName("");
  }, [selectedCwd]);

  const openBranchMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setBranchMenuRect({ top: rect.bottom + 6, left: rect.left });
    setBranchMenuOpen((v) => !v);
    setRemoteOpen(false);
    setNewBranchName("");
  };

  const handleSwitchBranch = async (branch: string) => {
    if (!gitBranches || branch === gitBranches.current) {
      setBranchMenuOpen(false);
      return;
    }
    const ok = await gitBranches.switchBranch(branch);
    if (ok) setBranchMenuOpen(false);
  };

  const handleCreateBranch = async () => {
    if (!gitBranches || !newBranchName.trim()) return;
    const ok = await gitBranches.createBranch(newBranchName);
    if (ok) {
      setNewBranchName("");
      setBranchMenuOpen(false);
      newBranchInputRef.current = null;
    }
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
                <div ref={branchRowRef} className="shrink-0 relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openBranchMenu(e);
                    }}
                    aria-label={t("git.switchBranch")}
                    title={t("git.switchBranch")}
                    className={`flex items-center gap-[3px] max-w-[110px] h-[16px] px-[5px] bg-transparent border border-[var(--border)] rounded-full text-[9px] font-mono cursor-pointer transition-colors duration-150 ${
                      branchMenuOpen
                        ? "text-text bg-bg-hover"
                        : "text-text-dim hover:text-text hover:bg-bg-hover"
                    }`}
                  >
                    <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
                      <circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="8" r="2" />
                      <path d="M4 6v4M12 10c0-2-2-2-4-2" />
                    </svg>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{gitBranches.current}</span>
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

            {isSelected && branchMenuOpen && branchMenuRect && gitBranches && (
              <div
                ref={branchPanelRef}
                className="t-dropdown is-open material-popover"
                data-origin="top-left"
                style={{
                  position: "fixed",
                  top: branchMenuRect.top,
                  left: branchMenuRect.left,
                  zIndex: 500,
                  background: "var(--material-popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-panel)",
                  boxShadow: "var(--shadow-popover)",
                  overflow: "hidden",
                  minWidth: 180,
                  maxWidth: 260,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ maxHeight: 220, overflowY: "auto" }}>
                  {gitBranches.branches.map((branch) => {
                    const isCurrent = branch === gitBranches.current;
                    return (
                      <button
                        key={branch}
                        onClick={() => handleSwitchBranch(branch)}
                        disabled={gitBranches.busy}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          width: "100%", padding: "6px 12px",
                          background: isCurrent ? "var(--bg-selected)" : "none",
                          border: "none",
                          color: isCurrent ? "var(--text)" : "var(--text-muted)",
                          cursor: gitBranches.busy ? "wait" : "pointer",
                          fontSize: 11, textAlign: "left",
                          fontWeight: isCurrent ? 600 : 400,
                          whiteSpace: "nowrap",
                        }}
                        className={isCurrent ? "" : "hover:bg-[var(--bg-hover)] transition-colors duration-150"}
                      >
                        {isCurrent
                          ? <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                          : <span style={{ width: 9, flexShrink: 0 }} />}
                        <span className="overflow-hidden text-ellipsis">{branch}</span>
                      </button>
                    );
                  })}

                  {gitBranches.remoteBranches.length > 0 && (
                    <button
                      onClick={() => setRemoteOpen((v) => !v)}
                      aria-expanded={remoteOpen}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        width: "100%", padding: "6px 12px",
                        background: "none", border: "none",
                        color: "var(--text-dim)",
                        cursor: "pointer", fontSize: 10, textAlign: "left",
                      }}
                      className="hover:bg-[var(--bg-hover)] transition-colors duration-150"
                    >
                      <svg
                        width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: remoteOpen ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }}
                      >
                        <polyline points="3 1.5 7 5 3 8.5" />
                      </svg>
                      <span>{t("git.remoteBranches")}</span>
                      <span className="tabular-nums">({gitBranches.remoteBranches.length})</span>
                    </button>
                  )}

                  {remoteOpen &&
                    gitBranches.remoteBranches.map((ref) => (
                      <button
                        key={ref}
                        onClick={() => handleSwitchBranch(ref)}
                        disabled={gitBranches.busy}
                        title={t("git.checkoutRemoteHint")}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          width: "100%", padding: "5px 12px 5px 25px",
                          background: "none", border: "none",
                          color: "var(--text-muted)",
                          cursor: gitBranches.busy ? "wait" : "pointer",
                          fontSize: 11, textAlign: "left",
                          whiteSpace: "nowrap",
                        }}
                        className="hover:bg-[var(--bg-hover)] transition-colors duration-150"
                      >
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                          <circle cx="8" cy="3.5" r="2" /><circle cx="8" cy="12.5" r="2" />
                          <path d="M8 5.5v5" />
                        </svg>
                        <span className="overflow-hidden text-ellipsis">{ref}</span>
                      </button>
                    ))}
                </div>
                <div style={{ borderTop: "1px solid var(--border)" }} className="p-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      ref={newBranchInputRef}
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateBranch();
                        if (e.key === "Escape") setBranchMenuOpen(false);
                      }}
                      placeholder={t("git.newBranchPlaceholder")}
                      className="flex-1 min-w-0 text-[11px] font-mono px-1.5 py-[3px] bg-transparent border border-[var(--border)] rounded-[4px] text-text outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={handleCreateBranch}
                      disabled={gitBranches.busy || !newBranchName.trim()}
                      aria-label={t("git.createBranch")}
                      title={t("git.createBranch")}
                      className="shrink-0 flex items-center justify-center w-[22px] h-[22px] p-0 bg-transparent border-none rounded-[4px] text-text-dim hover:text-text hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <line x1="6" y1="1.5" x2="6" y2="10.5" /><line x1="1.5" y1="6" x2="10.5" y2="6" />
                      </svg>
                    </button>
                  </div>
                  {gitBranches.error && (
                    <div className="pt-1 px-0.5 text-[10px] break-all" style={{ color: "var(--danger)" }} title={gitBranches.error}>
                      {t("git.branchError")}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isOpen && renderProject ? renderProject(cwd) : null}
          </div>
        );
      })}
    </div>
  );
}
