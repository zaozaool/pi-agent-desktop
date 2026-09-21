import test from "node:test";
import assert from "node:assert/strict";
import {
  getAssistantContent,
  getImageContent,
  getTextContent,
} from "./message-content.ts";

test("message content helpers preserve valid text and image blocks", () => {
  const content = [
    { type: "text", text: "hello" },
    { type: "image", source: { type: "url", url: "https://example.test/a.png" } },
    { type: "text", text: "world" },
  ];

  assert.equal(getTextContent(content), "hello\nworld");
  assert.equal(getImageContent(content).length, 1);
});

test("getImageContent normalizes flat on-disk image blocks ({data, mimeType})", () => {
  // pi stores images in .jsonl flat, without a source wrapper
  const content = [
    { type: "text", text: "see attachment" },
    { type: "image", data: "aGk=", mimeType: "image/png" },
  ];

  assert.deepEqual(getImageContent(content), [
    { type: "image", source: { type: "base64", media_type: "image/png", data: "aGk=" } },
  ]);
  // missing mimeType falls back to png, missing data drops the block
  assert.deepEqual(getImageContent([{ type: "image", data: "aGk=" }]), [
    { type: "image", source: { type: "base64", media_type: "image/png", data: "aGk=" } },
  ]);
  assert.deepEqual(getImageContent([{ type: "image", mimeType: "image/jpeg" }]), []);
});

test("message content helpers safely handle malformed runtime payloads", () => {
  assert.equal(getTextContent(undefined), "");
  assert.equal(getTextContent(null), "");
  assert.equal(getTextContent({ type: "text", text: "not an array" }), "");
  assert.deepEqual(getImageContent(undefined), []);
  assert.deepEqual(getAssistantContent(undefined), []);
  assert.deepEqual(
    getAssistantContent([null, { type: "unknown" }, { type: "text", text: "ok" }]),
    [{ type: "text", text: "ok" }],
  );

  assert.equal(
    getTextContent([null, { type: "text", text: 123 }, { type: "text", text: "ok" }]),
    "ok",
  );
  assert.deepEqual(
    getImageContent([{ type: "image" }, { type: "image", source: {} }]),
    [{ type: "image", source: {} }],
  );
});
