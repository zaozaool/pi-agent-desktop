import { test } from "node:test";
import assert from "node:assert/strict";
import { findSessionMatches, getMessageSearchableText } from "./session-search.ts";
import type { AgentMessage, UserMessage, AssistantMessage } from "./types.ts";

function userMsg(content: UserMessage["content"]): UserMessage {
  return { role: "user", content };
}

function assistantMsg(texts: string[]): AssistantMessage {
  return {
    role: "assistant",
    content: texts.map((text) => ({ type: "text", text })),
  } as AssistantMessage;
}

test("getMessageSearchableText handles string and block user content", () => {
  assert.equal(getMessageSearchableText(userMsg("hello world")), "hello world");
  assert.equal(
    getMessageSearchableText(userMsg([
      { type: "text", text: "a" },
      { type: "image", data: "x", mimeType: "image/png" } as never,
      { type: "text", text: "b" },
    ])),
    "a\nb"
  );
});

test("getMessageSearchableText joins assistant text blocks and skips other blocks", () => {
  const msg = assistantMsg(["one", "two"]);
  assert.equal(getMessageSearchableText(msg), "one\ntwo");
});

test("findSessionMatches is case-insensitive and counts occurrences", () => {
  const messages: AgentMessage[] = [
    userMsg("Fix the BUG please"),
    assistantMsg(["the bug is in lib/foo.ts"]),
    userMsg("no match here"),
    assistantMsg(["bug bug bug!"]),
  ];
  const matches = findSessionMatches(messages, ["e1", "e2", "e3", "e4"], "bug");
  assert.deepEqual(
    matches.map((m) => ({ messageIdx: m.messageIdx, occurrences: m.occurrences })),
    [
      { messageIdx: 0, occurrences: 1 },
      { messageIdx: 1, occurrences: 1 },
      { messageIdx: 3, occurrences: 3 },
    ]
  );
  // visibleIdx skips nothing here (all messages are user/assistant)
  assert.deepEqual(matches.map((m) => m.visibleIdx), [0, 1, 3]);
  assert.deepEqual(matches.map((m) => m.entryId), ["e1", "e2", "e4"]);
});

test("findSessionMatches skips toolResult messages in visibleIdx numbering", () => {
  const messages = [
    userMsg("alpha"),
    { role: "toolResult", toolCallId: "tc1", content: "alpha" } as never,
    assistantMsg(["alpha and more"]),
  ];
  const matches = findSessionMatches(messages as AgentMessage[], ["e1", "e2", "e3"], "alpha");
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map((m) => m.visibleIdx), [0, 1]);
  assert.deepEqual(matches.map((m) => m.messageIdx), [0, 2]);
});

test("findSessionMatches returns empty for blank queries", () => {
  const messages: AgentMessage[] = [userMsg("hello")];
  assert.deepEqual(findSessionMatches(messages, ["e1"], ""), []);
  assert.deepEqual(findSessionMatches(messages, ["e1"], "   "), []);
  assert.deepEqual(findSessionMatches(messages, ["e1"], "zzz"), []);
});
