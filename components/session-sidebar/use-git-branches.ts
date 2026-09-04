"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GitBranchesState = {
  isGit: boolean;
  current: string | null;
  branches: string[];
  /** Local remote-tracking refs (origin/...), sorted */
  remoteBranches: string[];
  busy: boolean;
  error: string | null;
  /** git fetch's summary output from the last successful fetch */
  fetchMessage: string | null;
  /** Runs `git fetch --prune`; resolves false when the fetch failed. */
  fetchRemote: () => Promise<boolean>;
};

type BranchesResponse = {
  isGitRepo?: boolean;
  current?: string | null;
  branches?: string[];
  remoteBranches?: string[];
  error?: string;
  message?: string;
};

/**
 * Tracks the Git branch of the given project directory and exposes a
 * remote-fetch operation. Failures surface git's stderr through `error`
 * (cleared on the next attempt).
 */
export function useGitBranches(
  cwd: string | null,
  options: { onFetched?: (cwd: string) => void } = {}
): GitBranchesState {
  const { onFetched } = options;
  const [isGit, setIsGit] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setError(null);
    if (!cwd) {
      setIsGit(false);
      setCurrent(null);
      setBranches([]);
      setRemoteBranches([]);
      return;
    }
    fetch(`/api/git/branches?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((d: BranchesResponse) => {
        if (requestSeq.current !== seq) return;
        if (d.error) {
          setIsGit(false);
          setCurrent(null);
          setBranches([]);
          setRemoteBranches([]);
          setError(d.error);
          return;
        }
        setIsGit(Boolean(d.isGitRepo));
        setCurrent(d.current ?? null);
        setBranches(d.branches ?? []);
        setRemoteBranches(d.remoteBranches ?? []);
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setIsGit(false);
        setCurrent(null);
        setBranches([]);
        setRemoteBranches([]);
      });
  }, [cwd]);

  const fetchRemote = useCallback(async () => {
    // Non-git directories have no fetch button rendered; guard here too so a
    // stale call never runs git fetch or surfaces an error for them.
    if (!cwd || !isGit) return false;
    setBusy(true);
    setError(null);
    setFetchMessage(null);
    try {
      const res = await fetch("/api/git/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const d = (await res.json()) as BranchesResponse;
      if (!res.ok) {
        setError(d.error ?? `HTTP ${res.status}`);
        return false;
      }
      setIsGit(Boolean(d.isGitRepo));
      setCurrent(d.current ?? null);
      setBranches(d.branches ?? []);
      setRemoteBranches(d.remoteBranches ?? []);
      setFetchMessage(d.message ?? "");
      onFetched?.(cwd);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [cwd, isGit, onFetched]);

  return { isGit, current, branches, remoteBranches, busy, error, fetchMessage, fetchRemote };
}
