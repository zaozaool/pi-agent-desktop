"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { SessionInfo } from "@/lib/types";
import { FileExplorer } from "./FileExplorer";
import { SidebarHeader } from "./session-sidebar/SidebarHeader";
import { SessionTreeItem } from "./session-sidebar/SessionTree";
import { ProjectTree } from "./session-sidebar/ProjectTree";
import { buildSessionTree, getAllCwds, getRecentCwds, pickDirectoryFromHost } from "./session-sidebar/helpers";
import { resolveCustomPathSelection } from "@/lib/custom-path-selection";

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
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCwd = selectedCwdProp ?? null;
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerKey, setExplorerKey] = useState(0);
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);
  const [cwdPickerError, setCwdPickerError] = useState<string | null>(null);
  
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
          <div style={{ padding: "6px 14px 8px 26px", color: "var(--text-dim)", fontSize: 11 }}>
            No sessions yet
          </div>
        );
      }
      return (
        <div style={{ paddingLeft: 12 }}>
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
    [sessionTreeByCwd, selectedSessionId, onSelectSession, loadSessions, onSessionDeleted, onBranchSession, onCloneSession, onExportSession]
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
          flex: explorerOpen && (selectedCwdProp || selectedCwd) ? "1 1 0" : "1 1 auto",
          overflowY: "auto",
          padding: "4px 0",
          minHeight: 80,
        }}
      >
        {loading && (
          <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>
            Loading...
          </div>
        )}
        {error && (
          <div style={{ padding: "12px 14px", color: "var(--danger)", fontSize: 12 }}>
            {error}
          </div>
        )}
        {!loading && !error && allCwds.length === 0 && (
          <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>
            No projects yet - open a folder below to get started.
          </div>
        )}
        <ProjectTree
          cwds={allCwds}
          selectedCwd={selectedCwd}
          onSelect={(cwd) => {
            if (cwd !== selectedCwd) onCwdChange?.(cwd);
          }}
          renderProject={renderProjectSessions}
          sessionCounts={sessionCounts}
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
            <span>Use default directory</span>
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
            <span>{openingProject ? "Opening folder picker..." : "Custom path…"}</span>
          </button>
          {cwdPickerError && (
            <div className="px-2.5 pb-1.5 text-[11px]" style={{ color: "var(--danger)" }}>
              {cwdPickerError}
            </div>
          )}
        </div>
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
              Explorer
            </button>
            <button
              onClick={() => {
                setExplorerKey((k) => k + 1);
                setExplorerRefreshDone(true);
                if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
                explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
              }}
              title="Refresh explorer"
              aria-label="Refresh explorer"
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
