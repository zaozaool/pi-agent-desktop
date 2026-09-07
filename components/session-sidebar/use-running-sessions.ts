"use client";

import { useEffect, useState } from "react";

/**
 * Polls which sessions currently have a running agent loop, so the sidebar
 * can keep showing a spinner on sessions the user is not looking at.
 */
export function useRunningSessions(intervalMs = 4000): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/agent/running");
        if (!res.ok) return;
        const d = (await res.json()) as { sessionIds?: string[] };
        if (!cancelled) setIds(new Set(d.sessionIds ?? []));
      } catch {
        // transient network issues just keep the previous snapshot
      }
    };
    void load();
    const timer = setInterval(() => void load(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return ids;
}
