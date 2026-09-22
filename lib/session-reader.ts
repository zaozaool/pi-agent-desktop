import { SessionManager, buildSessionContext as piBuildSessionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionInfo, SessionContext, FlatTreeNode, TreeNodeEntry, AssistantMessage, SessionHeader, AgentMessage, UserMessage, CustomMessage } from "./types.ts";
import type { SessionEntry as PiSessionEntry, SessionInfo as PiSessionInfo } from "@earendil-works/pi-coding-agent";
import { normalizeToolCalls, COMPACTION_SUMMARY_PREFIX } from "./normalize.ts";
import { readFile } from "fs/promises";
import { createReadStream } from "fs";
import {
  cacheSessionPathEntry,
  createSessionPathCacheState,
  getCachedSessionPath,
  invalidateSessionPathEntry,
  markSessionPathMiss,
  type SessionPathCacheState,
} from "./session-path-cache.ts";

export { getAgentDir };

// ============================================================================
// Session path cache: sessionId → absolute file path
// Stored in globalThis for hot-reload safety
// Positive + short-TTL negative cache (see session-path-cache.ts)
// ============================================================================
declare global {
  var __piSessionPathCacheState: SessionPathCacheState | undefined;
}

function getPathCacheState(): SessionPathCacheState {
  if (!globalThis.__piSessionPathCacheState) {
    globalThis.__piSessionPathCacheState = createSessionPathCacheState();
  }
  return globalThis.__piSessionPathCacheState;
}

function getPathCache(): Map<string, string> {
  return getPathCacheState().paths;
}

export function getSessionsDir(): string {
  return `${getAgentDir()}/sessions`;
}

export async function listAllSessions(): Promise<SessionInfo[]> {
  const piSessions: PiSessionInfo[] = await SessionManager.listAll();
  const pathToId = new Map<string, string>();
  for (const s of piSessions) pathToId.set(s.path, s.id);

  const state = getPathCacheState();
  return piSessions.map((s) => {
    // Populate path cache so resolveSessionPath works without a full scan
    cacheSessionPathEntry(state, s.id, s.path);
    const leafEntryId =
      typeof s === "object" && s !== null && "leafEntryId" in s && typeof s.leafEntryId === "string"
        ? s.leafEntryId
        : undefined;
    return {
      path: s.path,
      id: s.id,
      cwd: s.cwd,
      name: s.name,
      created: s.created instanceof Date ? s.created.toISOString() : String(s.created),
      modified: s.modified instanceof Date ? s.modified.toISOString() : String(s.modified),
      messageCount: s.messageCount,
      firstMessage: s.firstMessage || "(no messages)",
      parentSessionId: s.parentSessionPath ? pathToId.get(s.parentSessionPath) : undefined,
      leafEntryId,
    };
  });
}

export async function resolveSessionPath(sessionId: string): Promise<string | null> {
  const state = getPathCacheState();
  const cached = getCachedSessionPath(state, sessionId);
  if (cached.hit) return cached.path;

  // A negative entry can go stale within its TTL: the session file may have
  // been created right after the miss was recorded (先查后建 — a fork/clone
  // registering a brand-new id), which would hide the now-existing session
  // from real requests → false 404. If a live RPC wrapper exists for this id,
  // the file is guaranteed to exist (startRpcSession opened it), so drop the
  // stale negative and fall through to a re-scan instead of returning null.
  if (cached.negative) {
    if (!getLiveRpcSession(sessionId)) return null;
    state.misses.delete(sessionId);
  }

  // Cache miss: scan all sessions to populate cache, then retry
  await listAllSessions();
  const after = getPathCache().get(sessionId) ?? null;
  if (!after) markSessionPathMiss(state, sessionId);
  else state.misses.delete(sessionId);
  return after;
}

/** Live RPC wrappers are stored on globalThis by lib/rpc-manager.ts (HMR-safe). */
type LiveRpcSession = { isAlive(): boolean };

function getLiveRpcSession(sessionId: string): LiveRpcSession | undefined {
  const registry = (globalThis as { __piSessions?: Map<string, LiveRpcSession> }).__piSessions;
  const session = registry?.get(sessionId);
  return session?.isAlive() ? session : undefined;
}

export function cacheSessionPath(sessionId: string, filePath: string): void {
  cacheSessionPathEntry(getPathCacheState(), sessionId, filePath);
}

export function invalidateSessionPathCache(sessionId: string): void {
  invalidateSessionPathEntry(getPathCacheState(), sessionId);
}

export function readFirstLineAsync(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 4096 });
    let buffer = "";
    let resolved = false;

    stream.on("data", (chunk: Uint8Array | string) => {
      buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      const idx = buffer.indexOf("\n");
      if (idx !== -1) {
        resolved = true;
        resolve(buffer.slice(0, idx));
        stream.destroy();
      }
    });

    stream.on("end", () => {
      if (!resolved) {
        resolve(buffer || null);
      }
    });

    stream.on("error", (err) => {
      console.error("Error reading first line from", filePath, err);
      if (!resolved) {
        resolve(null);
      }
    });
  });
}

const LABEL_PREVIEW_MAX = 200;

/** Flatten a message entry's content to the text preview the branch navigator displays. */
function toTreeNodeEntry(entry: SessionEntry): TreeNodeEntry {
  const node: TreeNodeEntry = { id: entry.id, type: entry.type, timestamp: entry.timestamp };
  if (entry.type === "message" && "message" in entry) {
    const msg = (entry as unknown as { message: { role: string; content: unknown } }).message;
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join(" ");
    }
    if (text.length > LABEL_PREVIEW_MAX) text = text.slice(0, LABEL_PREVIEW_MAX) + "…";
    node.message = { role: msg.role, content: text };
  }
  return node;
}

export function buildTree(entries: SessionEntry[]): FlatTreeNode[] {
  const labelsById = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type === "label") {
      const l = entry as { type: "label"; targetId: string; label?: string };
      if (l.label) labelsById.set(l.targetId, l.label);
      else labelsById.delete(l.targetId);
    }
  }
  return entries.map((entry) => ({
    id: entry.id,
    parentId: entry.parentId ?? null,
    label: labelsById.get(entry.id),
    entry: toTreeNodeEntry(entry),
  }));
}

export function buildSessionContext(entries: SessionEntry[], leafId?: string | null): SessionContext {
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);

  const piEntries = entries as unknown as PiSessionEntry[];
  const piCtx = piBuildSessionContext(piEntries, leafId, byId as unknown as Map<string, PiSessionEntry>);

  // Build entryIds: parallel array to messages[], mapping each message back to its entry id.
  // Needed for fork and navigate_tree calls from the UI.
  let targetLeaf: SessionEntry | undefined;
  if (leafId === null) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }
  if (leafId) targetLeaf = byId.get(leafId);
  if (!targetLeaf) targetLeaf = entries[entries.length - 1];
  if (!targetLeaf) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }

  // Walk path from target leaf to root
  const path: SessionEntry[] = [];
  let cur: SessionEntry | undefined = targetLeaf;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  // Find the last compaction on path (mirrors pi's buildSessionContext logic)
  let compactionId: string | undefined;
  let firstKeptEntryId: string | undefined;
  for (const e of path) {
    if (e.type === "compaction") {
      compactionId = e.id;
      firstKeptEntryId = (e as { firstKeptEntryId: string }).firstKeptEntryId;
    }
  }

  const entryIds: string[] = [];
  if (compactionId) {
    // The first message in piCtx.messages is the synthetic compaction summary — map to compaction entry id
    entryIds.push(compactionId);
    const compactionIdx = path.findIndex((e) => e.id === compactionId);
    const firstKeptIdx = firstKeptEntryId
      ? path.findIndex((e, i) => i < compactionIdx && e.id === firstKeptEntryId)
      : -1;
    const startIdx = firstKeptIdx >= 0 ? firstKeptIdx : compactionIdx;
    for (let i = startIdx; i < compactionIdx; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
    for (let i = compactionIdx + 1; i < path.length; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
  } else {
    for (const e of path) {
      if (e.type === "message") entryIds.push(e.id);
    }
  }

  // pi injects compaction summary as {role:"compactionSummary", summary, tokensBefore}.
  // Convert to {role:"user"} so MessageView can render it the same as before.
  const messages = (piCtx.messages as AssistantMessage[]).map((msg) => {
    const raw = msg as unknown as Record<string, unknown>;
    if (raw.role === "compactionSummary") {
      return {
        role: "user" as const,
        content: `${COMPACTION_SUMMARY_PREFIX}\n\n${raw.summary ?? ""}`,
        timestamp: raw.timestamp as number | undefined,
      };
    }
    return normalizeToolCalls(msg);
  });

  return {
    messages,
    entryIds,
    thinkingLevel: piCtx.thinkingLevel,
    model: piCtx.model,
  };
}

export function getLeafId(entries: SessionEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries[entries.length - 1].id;
}

/** True when a context message is the synthetic compaction-summary user message. */
export function isCompactionSummaryMessage(msg: AgentMessage): boolean {
  if (msg.role !== "user") return false;
  const content = (msg as UserMessage).content;
  const text = typeof content === "string" ? content : "";
  return text.startsWith(COMPACTION_SUMMARY_PREFIX);
}

function toMessageTimestamp(ts: string | number | undefined): number | undefined {
  if (ts === undefined) return undefined;
  if (typeof ts === "number") return ts;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Full-history view: every message on the leaf path WITHOUT compaction trimming.
 *
 * pi's compaction appends a summary entry and rebuilds context from
 * `firstKeptEntryId`, but the original entries stay in the .jsonl. This walks the
 * same leaf path as buildSessionContext and returns ALL of them, rendering the
 * compaction entry as the same synthetic summary message so the boundary remains
 * visible. Read-only viewer data — entryIds still map 1:1 to messages.
 */
export function buildFullContext(entries: SessionEntry[], leafId?: string | null): SessionContext {
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);

  const piEntries = entries as unknown as PiSessionEntry[];
  const piCtx = piBuildSessionContext(piEntries, leafId, byId as unknown as Map<string, PiSessionEntry>);

  let targetLeaf: SessionEntry | undefined;
  if (leafId === null) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }
  if (leafId) targetLeaf = byId.get(leafId);
  if (!targetLeaf) targetLeaf = entries[entries.length - 1];
  if (!targetLeaf) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }

  // Walk path from target leaf to root (same as buildSessionContext)
  const path: SessionEntry[] = [];
  let cur: SessionEntry | undefined = targetLeaf;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  const entryIds: string[] = [];
  const messages: AgentMessage[] = [];
  for (const e of path) {
    if (e.type === "message") {
      entryIds.push(e.id);
      messages.push(normalizeToolCalls((e as { message: AgentMessage }).message));
    } else if (e.type === "compaction") {
      const raw = e as unknown as { summary?: string; timestamp?: string };
      entryIds.push(e.id);
      messages.push({
        role: "user",
        content: `${COMPACTION_SUMMARY_PREFIX}\n\n${raw.summary ?? ""}`,
        timestamp: toMessageTimestamp(raw.timestamp),
      });
    } else if (e.type === "branch_summary") {
      const raw = e as unknown as { summary?: string; timestamp?: string };
      entryIds.push(e.id);
      messages.push({
        role: "user",
        content: `*Branch point — the conversation continues from an earlier message. Branch summary:*
\n${raw.summary ?? ""}`,
        timestamp: toMessageTimestamp(raw.timestamp),
      });
    } else if (e.type === "custom_message") {
      const raw = e as unknown as {
        customType: string;
        content: CustomMessage["content"];
        display?: boolean;
        details?: unknown;
        timestamp?: string;
      };
      entryIds.push(e.id);
      messages.push({
        role: "custom",
        customType: raw.customType,
        content: raw.content,
        display: raw.display ?? true,
        details: raw.details,
        timestamp: toMessageTimestamp(raw.timestamp),
      });
    }
  }

  return { messages, entryIds, thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
}

export async function getSessionEntriesAsync(filePath: string): Promise<SessionEntry[]> {
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n");
  const entries: SessionEntry[] = [];
  for (const line of lines) {
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line) as SessionEntry);
      } catch (err) {
        console.error("Failed to parse JSONL line:", line, err);
      }
    }
  }
  return entries;
}

export async function getHeaderAsync(filePath: string): Promise<SessionHeader | null> {
  try {
    const firstLine = await readFirstLineAsync(filePath);
    if (firstLine && firstLine.trim()) {
      const header = JSON.parse(firstLine);
      if (header.type === "session") {
        return header as SessionHeader;
      }
    }
  } catch (err) {
    console.error("Failed to read header asynchronously:", err);
  }
  return null;
}

export function getSessionName(entries: SessionEntry[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type === "session_info") {
      return (entries[i] as { name?: string }).name;
    }
  }
  return undefined;
}



