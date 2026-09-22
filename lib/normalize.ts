import type { AgentMessage, ToolCallContent } from "./types.ts";

export function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function normalizeToolCallBlock(block: unknown): ToolCallContent | null {
  if (!isObject(block) || block.type !== "toolCall") return null;
  return {
    type: "toolCall",
    toolCallId: typeof block.toolCallId === "string" ? block.toolCallId : (typeof block.id === "string" ? block.id : ""),
    toolName: typeof block.toolName === "string" ? block.toolName : (typeof block.name === "string" ? block.name : ""),
    input: typeof block.input === "object" && block.input !== null && !Array.isArray(block.input)
      ? block.input as Record<string, unknown>
      : (typeof block.arguments === "object" && block.arguments !== null && !Array.isArray(block.arguments)
        ? block.arguments as Record<string, unknown>
        : {}),
  };
}

export function normalizeToolCalls(msg: AgentMessage): AgentMessage {
  if (msg.role !== "assistant") return msg;
  const content = msg.content;
  if (!Array.isArray(content)) return msg;
  const normalized = content.map((block) => {
    const result = normalizeToolCallBlock(block);
    return result ?? block;
  });
  return { ...msg, content: normalized };
}

/** Prefix used by pi (and our context builders) for the synthetic compaction-summary user message. */
export const COMPACTION_SUMMARY_PREFIX = "*The conversation history before this point was compacted into the following summary:*";

/** True when a context message is the synthetic compaction-summary user message. */
export function isCompactionSummaryMessage(msg: AgentMessage): boolean {
  if (msg.role !== "user") return false;
  const content = (msg as { content?: unknown }).content;
  const text = typeof content === "string" ? content : "";
  return text.startsWith(COMPACTION_SUMMARY_PREFIX);
}