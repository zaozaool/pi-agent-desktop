import { test } from "node:test";
import assert from "node:assert/strict";
import { getAllCwds, pathBasename, shortenCwd } from "./helpers.ts";
import type { SessionInfo } from "../../lib/types.ts";

function makeSession(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    id: "s1",
    name: null,
    firstMessage: "",
    messageCount: 1,
    modified: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as SessionInfo;
}

test("getAllCwds returns unique cwds sorted by most recent activity", () => {
  const sessions = [
    makeSession({ id: "a", cwd: "/w/proj-a", modified: "2026-01-03T00:00:00.000Z" }),
    makeSession({ id: "b", cwd: "/w/proj-b", modified: "2026-01-05T00:00:00.000Z" }),
    makeSession({ id: "c", cwd: "/w/proj-a", modified: "2026-01-04T00:00:00.000Z" }),
  ];
  assert.deepEqual(getAllCwds(sessions), ["/w/proj-b", "/w/proj-a"]);
});

test("getAllCwds skips sessions without cwd", () => {
  const sessions = [
    makeSession({ id: "a", cwd: undefined, modified: "2026-01-05T00:00:00.000Z" }),
    makeSession({ id: "b", cwd: "/w/proj-b", modified: "2026-01-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(getAllCwds(sessions), ["/w/proj-b"]);
});

test("pathBasename handles unix, windows and trailing separators", () => {
  assert.equal(pathBasename("/Users/alice/work/proj"), "proj");
  assert.equal(pathBasename("C:\\dev\\proj"), "proj");
  assert.equal(pathBasename("/w/proj/"), "proj");
});

test("shortenCwd collapses deep paths to last two segments", () => {
  assert.equal(shortenCwd("/Users/alice/work/proj"), "…/alice/work".slice(0, 0) + "…/work/proj");
  assert.equal(shortenCwd("/w/proj"), "/w/proj");
});
