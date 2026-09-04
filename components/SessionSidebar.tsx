"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { SessionInfo } from "@/lib/types";
import { FileExplorer } from "./FileExplorer";
import { SidebarHeader } from "./session-sidebar/SidebarHeader";
import { SessionTreeItem } from "./session-sidebar/SessionTree";
import { ProjectTree } from "./session-sidebar/ProjectTree";
import { useGitBranches } from "./session-sidebar/use-git-branches";
import { buildSessionTree, getAllCwds, getRecentCwds, pickDirectoryFromHost, sortCwdsAlphabetically } from "./session-sidebar/helpers";
import { resolveCustomPathSelection } from "@/lib/custom-path-selection";
import { useI18n } from "./I18nProvider";

type ProjectSortMode = "recent" | "alpha";
const PROJECT_SORT_STORAGE_KEY = "pi.sidebar.projectSort";

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
  onBranchSession?: (session: SessionInfo) => void;
  onCloneSession?: (session: SessionInfo) => void;
  onExportSession?: (session: SessionInfo) => void;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
  explorerRefreshKey?: number;
  onAtMention?: (relativePath: string) => void;
}

export function SessionSidebar({
  selectedSessionId,
  onSelectSession,
  onNewSession,
  initialSessionId,
  onInitialRestoreDone,
  refreshKey,
  onSessionDeleted,
  onBranchSession,
  onCloneSession,
  onExportSession,
  selectedCwd: selectedCwdProp,
  onCwdChange,
  onOpenFile,
  explorerRefreshKey,
  onAtMention,
}: Props) {
  const { t } = useI18n();
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCwd = selectedCwdProp ?? null;
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [explorerKey, setExplorerKey] = useState(0);

  // Git branch of the selected project; switching branches changes the files
  // on disk, so the file explorer is refreshed afterwards.
  const gitBranches = useGitBranches(selectedCwd, {
    onBranchChanged: useCallback(() => setExplorerKey((k) => k + 1), []),
  });
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);
  const [cwdPickerError, setCwdPickerError] = useState<string | null>(null);
  const [projectSort, setProjectSort] = useState<ProjectSortMode>(() => {
    if (typeof window === "undefined") return "recent";
    return window.localStorage.getItem(PROJECT_SORT_STORAGE_KEY) === "alpha" ? "alpha" : "recent";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(PROJECT_SORT_STORAGE_KEY, projectSort);
    } catch {
      // storage unavailable - preference just won't persist
    }
  }, [projectSort]);

  // Controlled expanded-set for the project tree (shared with Collapse/Expand all)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set(selectedCwd ? [selectedCwd] : []));

  // Keep the selected project expanded when selection changes from outside
  useEffect(() => {
    if (!selectedCwd) return;
    setExpandedProjects((prev) => (prev.has(selectedCwd) ? prev : new Set([...prev, selectedCwd])));
  }, [selectedCwd]);
  
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sessions: SessionInfo[] };
      setAllSessions(data.sessions);
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
        sessionRefreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 2000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst);
  }, [loadSessions, refreshKey]);

  useEffect(() => {
    if (explorerRefreshKey !== undefined) setExplorerKey((k) => k + 1);
  }, [explorerRefreshKey]);

  const restoredRef = useRef(false);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0) return;

    if (selectedCwd === null) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          onSelectSession(target, true);
          return;
        }
        // Session not found — notify parent so it can show the placeholder
        onInitialRestoreDone?.();
      }
      const cwds = getRecentCwds(allSessions);
      if (cwds.length > 0) onCwdChange?.(cwds[0]);
    }
  }, [allSessions, selectedCwd, initialSessionId, onCwdChange, onSelectSession, onInitialRestoreDone]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
      if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
    };
  }, []);

  // Group sessions by cwd so the project tree can render each project's
  // session list (fork trees included) inline under its node.
  const allCwds = useMemo(() => getAllCwds(allSessions), [allSessions]);
  const sortedCwds = useMemo(
    () => (projectSort === "alpha" ? sortCwdsAlphabetically(allCwds) : allCwds),
    [allCwds, projectSort]
  );
  const anyProjectExpanded = sortedCwds.some((cwd) => expandedProjects.has(cwd));
  const toggleAllProjects = useCallback(() => {
    setExpandedProjects(anyProjectExpanded ? new Set<string>() : new Set(sortedCwds));
  }, [anyProjectExpanded, sortedCwds]);
  const sessionTreeByCwd = useMemo(() => {
    const byCwd = new Map<string, ReturnType<typeof buildSessionTree>>();
    for (const cwd of allCwds) {
      byCwd.set(cwd, buildSessionTree(allSessions.filter((s) => s.cwd === cwd)));
    }
    return byCwd;
  }, [allSessions, allCwds]);
  const sessionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of allSessions) {
      if (!s.cwd) continue;
      counts[s.cwd] = (counts[s.cwd] ?? 0) + 1;
    }
    return counts;
  }, [allSessions]);

  // Custom path… - open an arbitrary folder as the active project
  const handleCustomPath = useCallback(async () => {
    setOpeningProject(true);
    setCwdPickerError(null);
    try {
      const selectedPath = await pickDirectoryFromHost();
      const { nextCwd } = resolveCustomPathSelection(selectedCwd, selectedPath);
      if (nextCwd && nextCwd !== selectedCwd) {
        onCwdChange?.(nextCwd);
      }
    } catch (e) {
      setCwdPickerError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpeningProject(false);
    }
  }, [selectedCwd, onCwdChange]);

  // Use default directory
  const handleDefaultCwd = useCallback(async () => {
    try {
      const res = await fetch("/api/default-cwd", { method: "POST" });
      const data = (await res.json()) as { cwd?: string; error?: string };
      if (data.cwd) {
        setCwdPickerError(null);
        if (data.cwd !== selectedCwd) {
          onCwdChange?.(data.cwd);
        }
      }
    } catch {
      // ignore
    }
  }, [selectedCwd, onCwdChange]);

  const renderProjectSessions = useCallback(
    (cwd: string) => {
      const tree = sessionTreeByCwd.get(cwd);
      if (!tree || tree.length === 0) {
        return (
          <div style={{ padding: "6px 14px 8px 30px", color: "var(--text-dim)", fontSize: 11 }}>
            {t("sidebar.noSessionsYet")}
          </div>
        );
      }
      return (
        <div style={{ paddingLeft: 16 }}>
          {tree.map((node) => (
            <SessionTreeItem
              key={node.session.id}
              node={node}
              selectedSessionId={selectedSessionId}
              onSelectSession={onSelectSession}
              onRenamed={loadSessions}
              onSessionDeleted={(id) => {
                onSessionDeleted?.(id);
                loadSessions();
              }}
              onBranchSession={onBranchSession}
              onCloneSession={onCloneSession}
              onExportSession={onExportSession}
              depth={0}
            />
          ))}
        </div>
      );
    },
    [sessionTreeByCwd, selectedSessionId, onSelectSession, loadSessions, onSessionDeleted, onBranchSession, onCloneSession, onExportSession, t]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <SidebarHeader
        selectedCwd={selectedCwd}
        onNewSession={onNewSession}
        loadSessions={loadSessions}
        sessionRefreshDone={sessionRefreshDone}
      />

      {/* Project -> sessions tree */}
      <div
        style={{
          flex: !projectsOpen
            ? "0 0 auto"
            : explorerOpen && (selectedCwdProp || selectedCwd)
              ? "1 1 0"
              : "1 1 auto",
          overflowY: "auto",
          padding: "4px 0",
          minHeight: projectsOpen ? 80 : 0,
        }}
      >
        {loading && projectsOpen && (
          <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>
            {t("common.loading")}
          </div>
        )}
        {error && (
          <div style={{ padding: "12px 14px", color: "var(--danger)", fontSize: 12 }}>
            {error}
          </div>
        )}
        {!loading && !error && allCwds.length === 0 && (
          <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>
            {t("sidebar.noProjects")}
          </div>
        )}
        {/* Projects section header + collapse/expand section + collapse/expand all + sort toggle */}
        {allCwds.length > 0 && (
          <div className="flex items-center flex-shrink-0">
            <button
              onClick={() => setProjectsOpen((v) => !v)}
              aria-expanded={projectsOpen}
              aria-label={projectsOpen ? t("sidebar.collapseProjects") : t("sidebar.expandProjects")}
              title={projectsOpen ? t("sidebar.collapseProjects") : t("sidebar.expandProjects")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                padding: "6px 10px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                textAlign: "left",
              }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: projectsOpen ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s",
                  flexShrink: 0,
                }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              {t("sidebar.projects")}
            </button>
            <div className="flex items-center gap-[2px] mr-1.5">
              <button
                onClick={toggleAllProjects}
                aria-label={anyProjectExpanded ? t("sidebar.collapseAllProjects") : t("sidebar.expandAllProjects")}
                title={anyProjectExpanded ? t("sidebar.collapseAllProjects") : t("sidebar.expandAllProjects")}
                className="flex items-center gap-1 h-[20px] px-1.5 bg-transparent border-none rounded-[3px] text-text-dim hover:text-text hover:bg-bg-hover cursor-pointer transition-colors duration-150"
              >
                {anyProjectExpanded ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 14 12 8 18 14" />
                    <polyline points="6 20 12 14 18 20" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                    <polyline points="6 4 12 10 18 4" />
                  </svg>
                )}
                <span className="text-[10px] font-medium">
                  {anyProjectExpanded ? t("sidebar.collapse") : t("sidebar.expand")}
                </span>
              </button>
              <button
                onClick={() => setProjectSort((m) => (m === "recent" ? "alpha" : "recent"))}
                aria-label={projectSort === "recent" ? t("sidebar.sortByRecent") : t("sidebar.sortAlphabetically")}
                title={
                  projectSort === "recent"
                    ? t("sidebar.sortedByRecent")
                    : t("sidebar.sortedAlphabetically")
                }
                className="flex items-center gap-1 h-[20px] px-1.5 bg-transparent border-none rounded-[3px] text-text-dim hover:text-text hover:bg-bg-hover cursor-pointer transition-colors duration-150"
              >
                {projectSort === "recent" ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15.5 13.5" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h9M4 12h6" />
                    <path d="M16 4v9.5" />
                    <path d="M13 10.5 16 14l3-3.5" />
                    <path d="M4 17h16" />
                  </svg>
                )}
                <span className="text-[10px] font-medium">
                  {projectSort === "recent" ? t("sidebar.recentSort") : t("sidebar.alphaSort")}
                </span>
              </button>
            </div>
          </div>
        )}
        {projectsOpen && (
          <>
        <ProjectTree
          cwds={sortedCwds}
          selectedCwd={selectedCwd}
          onSelect={(cwd) => {
            if (cwd !== selectedCwd) onCwdChange?.(cwd);
          }}
          renderProject={renderProjectSessions}
          sessionCounts={sessionCounts}
          expanded={expandedProjects}
          onExpandedChange={setExpandedProjects}
          gitBranches={gitBranches}
        />

        {/* List footer actions (restored from the old project dropdown) */}
        <div className="mt-1 border-t border-divider">
          <button
            onClick={() => void handleDefaultCwd()}
            className="flex items-center gap-[7px] w-full px-2.5 py-1.5 bg-transparent border-none text-text-muted hover:bg-bg-hover cursor-pointer text-left text-[11px]"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
            </svg>
            <span>{t("sidebar.defaultDirectory")}</span>
          </button>
          <button
            onClick={() => void handleCustomPath()}
            disabled={openingProject}
            className="flex items-center gap-[7px] w-full px-2.5 py-1.5 bg-transparent border-none text-text-muted hover:bg-bg-hover cursor-pointer text-left text-[11px]"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" className="shrink-0">
              <line x1="5" y1="1" x2="5" y2="9" />
              <line x1="1" y1="5" x2="9" y2="5" />
            </svg>
            <span>{openingProject ? t("sidebar.openingFolderPicker") : t("sidebar.customPath")}</span>
          </button>
          {cwdPickerError && (
            <div className="px-2.5 pb-1.5 text-[11px]" style={{ color: "var(--danger)" }}>
              {cwdPickerError}
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* File Explorer section */}
      {(selectedCwdProp || selectedCwd) && (
        <div
          style={{
            borderTop: "1px solid var(--divider)",
            display: "flex",
            flexDirection: "column",
            flex: explorerOpen ? "1 1 0" : "0 0 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => setExplorerOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                padding: "6px 10px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                textAlign: "left",
              }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: explorerOpen ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s",
                  flexShrink: 0,
                }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              {t("sidebar.explorer")}
            </button>
            <button
              onClick={() => {
                setExplorerKey((k) => k + 1);
                setExplorerRefreshDone(true);
                if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
                explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
              }}
              title={t("sidebar.refreshExplorer")}
              aria-label={t("sidebar.refreshExplorer")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                padding: 0,
                marginRight: 6,
                background: explorerRefreshDone ? "var(--success-bg)" : "none",
                border: "none",
                color: explorerRefreshDone ? "var(--success)" : "var(--text-dim)",
                cursor: "pointer",
                borderRadius: "var(--radius-control)",
                flexShrink: 0,
                transition: "color 0.3s, background 0.3s",
              }}
              onMouseEnter={(e) => {
                if (explorerRefreshDone) return;
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (explorerRefreshDone) return;
                e.currentTarget.style.color = "var(--text-dim)";
                e.currentTarget.style.background = "none";
              }}
            >
              {explorerRefreshDone ? (
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
          {explorerOpen && (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
              <FileExplorer
                cwd={selectedCwdProp ?? selectedCwd!}
                onOpenFile={onOpenFile ?? (() => {})}
                refreshKey={explorerKey}
                onAtMention={onAtMention}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
