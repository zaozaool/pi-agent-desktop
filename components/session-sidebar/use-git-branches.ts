"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GitBranchesState = {
  isGit: boolean;
  current: string | null;
  branches: string[];
  busy: boolean;
  error: string | null;
  /** Switch to an existing branch; resolves false when the switch failed. */
  switchBranch: (branch: string) => Promise<boolean>;
  /** Create a branch and check it out; resolves false when it failed. */
  createBranch: (name: string) => Promise<boolean>;
};

type BranchesResponse = {
  isGitRepo?: boolean;
  current?: string | null;
  branches?: string[];
  error?: string;
};

/**
 * Tracks the Git branch of the given project directory and exposes
 * switch/create operations. Failed operations surface git's stderr through
 * `error` (cleared on the next attempt).
 */
export function useGitBranches(
  cwd: string | null,
  options: { onBranchChanged?: (cwd: string) => void } = {}
): GitBranchesState {
  const { onBranchChanged } = options;
  const [isGit, setIsGit] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setError(null);
    if (!cwd) {
      setIsGit(false);
      setCurrent(null);
      setBranches([]);
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
          setError(d.error);
          return;
        }
        setIsGit(Boolean(d.isGitRepo));
        setCurrent(d.current ?? null);
        setBranches(d.branches ?? []);
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setIsGit(false);
        setCurrent(null);
        setBranches([]);
      });
  }, [cwd]);

  const mutate = useCallback(
    async (action: "checkout" | "create", branch: string) => {
      if (!cwd || !branch.trim()) return false;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/git/branches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd, action, branch }),
        });
        const d = (await res.json()) as BranchesResponse;
        if (!res.ok) {
          setError(d.error ?? `HTTP ${res.status}`);
          return false;
        }
        setIsGit(Boolean(d.isGitRepo));
        setCurrent(d.current ?? null);
        setBranches(d.branches ?? []);
        onBranchChanged?.(cwd);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [cwd, onBranchChanged]
  );

  const switchBranch = useCallback(
    (branch: string) => mutate("checkout", branch),
    [mutate]
  );
  const createBranch = useCallback(
    (name: string) => mutate("create", name),
    [mutate]
  );

  return { isGit, current, branches, busy, error, switchBranch, createBranch };
}
