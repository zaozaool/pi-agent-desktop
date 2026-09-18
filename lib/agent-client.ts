// Client-side helper for POST /api/agent/[id].
//
// Every /api/agent/[id] route returns one of:
//   { success: true, data: <result> }
//   { error: string }              (non-2xx)
//
// Call sites previously repeated the same 5-line fetch block 13× in
// hooks/useAgentSession.ts. This helper collapses that down to one line.

/**
 * Statuses safe to retry once. A route-level failure for these statuses means
 * the command was NOT dispatched (prompt throws only before inner.prompt() is
 * called; delivery itself is fire-and-forget), so a blind retry cannot
 * double-send. Excludes 400 (validation) and 409 (trust handshake, which has
 * its own flow via ensureTrustThenFetch).
 *
 * This mainly shields against a Next.js dev-mode cold-compile race: when two
 * sessions fire their first POST concurrently at a not-yet-compiled
 * /api/agent/[id] route, the dev server can respond with a spurious 308
 * redirect to /api/agent (dynamic segment stripped), which then fails. The
 * route is compiled by the time the retry lands, so it succeeds.
 */
const RETRYABLE_STATUSES = new Set([404, 405, 500, 502, 503, 504]);

const RETRY_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendAgentCommand<T = unknown>(
  sessionId: string,
  command: Record<string, unknown>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`/api/agent/${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
    } catch (err) {
      // Network-level failure: nothing was delivered.
      if (attempt === 0) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
    let body: { success?: boolean; data?: T; error?: string };
    let parsed = true;
    try {
      body = await res.json();
    } catch {
      parsed = false;
      body = {};
    }
    const failed = !res.ok || body.error;
    if (failed && attempt === 0 && (parsed ? RETRYABLE_STATUSES.has(res.status) : true)) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    if (failed) {
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return body.data as T;
  }
}
