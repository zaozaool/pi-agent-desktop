import type { AgentMessage } from "@/lib/types";

export interface SessionSearchMatch {
  /** Index into the full messages[] array */
  messageIdx: number;
  /** Index into the user/assistant-only list - aligns with messageRefs */
  visibleIdx: number;
  entryId: string | null;
  /** How many times the query occurs in this message */
  occurrences: number;
}

/**
 * Extract the searchable text of a message: user text content plus assistant
 * text blocks. Tool calls / images are skipped - only the conversational
 * text that is always visible in the transcript is searchable.
 */
export function getMessageSearchableText(msg: AgentMessage | Partial<AgentMessage>): string {
  if (msg.role === "user") {
    const content = (msg as { content?: string | { type: string; text?: string }[] }).content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
    }
    return "";
  }
  if (msg.role === "assistant") {
    const blocks = (msg as { content?: { type: string; text?: string }[] }).content ?? [];
    return blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    count += 1;
    pos = haystack.indexOf(needle, pos + needle.length);
  }
  return count;
}

/**
 * Find all messages containing the (case-insensitive) query, in transcript
 * order. `entryIds` is the parallel array mapping messages to their .jsonl
 * entry ids; `visibleIdx` aligns with the messageRefs array so the UI can
 * scroll to a match.
 */
export function findSessionMatches(
  messages: AgentMessage[],
  entryIds: string[],
  query: string
): SessionSearchMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: SessionSearchMatch[] = [];
  let visibleIdx = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    const vi = visibleIdx++;
    const text = getMessageSearchableText(msg).toLowerCase();
    if (!text) continue;
    const occurrences = countOccurrences(text, q);
    if (occurrences > 0) {
      matches.push({ messageIdx: i, visibleIdx: vi, entryId: entryIds[i] ?? null, occurrences });
    }
  }
  return matches;
}
