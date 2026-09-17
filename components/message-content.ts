import type { AssistantContentBlock, ImageContent, TextContent } from "../lib/types";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function isTextContent(value: unknown): value is TextContent {
  return isRecord(value) && value.type === "text" && typeof value.text === "string";
}

/**
 * Normalize an image block into the {source:{...}} shape used by lib/types.
 * pi's on-disk .jsonl format stores images flat as {type:"image", data,
 * mimeType} (no source wrapper), while runtime messages and UI-sent messages
 * use the wrapped {source:{type:"base64", media_type, data}} shape. Handle
 * both so historical sessions keep rendering thumbnails.
 */
function normalizeImageContent(value: RecordValue): ImageContent | null {
  if (isRecord(value.source)) return value as unknown as ImageContent;
  const flat = value as { data?: unknown; mimeType?: unknown };
  if (typeof flat.data === "string" && flat.data.length > 0) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: typeof flat.mimeType === "string" && flat.mimeType ? flat.mimeType : "image/png",
        data: flat.data,
      },
    };
  }
  return null;
}

const ASSISTANT_BLOCK_TYPES = new Set(["text", "image", "thinking", "toolCall"]);

function isAssistantContentBlock(value: unknown): value is AssistantContentBlock {
  return isRecord(value)
    && typeof value.type === "string"
    && ASSISTANT_BLOCK_TYPES.has(value.type);
}

/**
 * Convert a message content payload to displayable text.
 * Runtime payloads can come from old/corrupt session files or an extension,
 * so malformed non-array values must degrade to an empty string instead of
 * throwing during React render.
 */
export function getTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter(isTextContent)
    .map((block) => block.text)
    .join("\n");
}

/** Return recognized assistant blocks from a runtime message payload. */
export function getAssistantContent(content: unknown): AssistantContentBlock[] {
  if (!Array.isArray(content)) return [];
  return content.filter(isAssistantContentBlock);
}

/** Return valid image blocks from a message payload, normalized to the source-wrapped shape. */
export function getImageContent(content: unknown): ImageContent[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) =>
    isRecord(block) && block.type === "image" ? normalizeImageContent(block) ?? [] : []
  );
}
