import assert from "node:assert/strict";
import test from "node:test";
import {
  GitBranchError,
  fetchGit,
  listGitBranches,
  type GitRunner,
} from "./git-branches.ts";

/** Fake runner scripted by exit codes and stdout, recording invocations. */
function fakeRunner(
  responses: Record<string, { code?: number; stdout?: string; stderr?: string }>,
  calls: string[][] = []
): GitRunner {
  return async (args) => {
    const key = args.join(" ");
    calls.push(args);
    const res = responses[key] ?? { code: 0, stdout: "", stderr: "" };
    return { code: res.code ?? 0, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  };
}

test("listGitBranches reports the repo state with sorted branches", async () => {
  const calls: string[][] = [];
  const runner = fakeRunner(
    {
      "rev-parse --is-inside-work-tree": { stdout: "true\n" },
      "rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "branch --format=%(refname:short)": { stdout: "feature/zeta\nmain\nfeature/alpha\n" },
    },
    calls
  );
  const info = await listGitBranches("/repo", runner);
  assert.deepEqual(info, {
    isGitRepo: true,
    current: "main",
    branches: ["feature/alpha", "feature/zeta", "main"],
  });
  assert.deepEqual(calls, [
    ["rev-parse", "--is-inside-work-tree"],
    ["rev-parse", "--abbrev-ref", "HEAD"],
    ["branch", "--format=%(refname:short)"],
  ]);
});

test("listGitBranches reports detached HEAD as no current branch", async () => {
  const runner = fakeRunner({
    "rev-parse --is-inside-work-tree": { stdout: "true\n" },
    "rev-parse --abbrev-ref HEAD": { stdout: "HEAD\n" },
    "branch --format=%(refname:short)": { stdout: "main\n" },
  });
  const info = await listGitBranches("/repo", runner);
  assert.equal(info.isGitRepo, true);
  assert.equal(info.current, null);
  assert.deepEqual(info.branches, ["main"]);
});

test("listGitBranches detects non-git directories", async () => {
  const calls: string[][] = [];
  const runner = fakeRunner(
    { "rev-parse --is-inside-work-tree": { code: 128, stderr: "not a git repository" } },
    calls
  );
  const info = await listGitBranches("/plain", runner);
  assert.deepEqual(info, { isGitRepo: false, current: null, branches: [] });
  assert.equal(calls.length, 1, "should not probe branches outside a repo");
});

test("fetchGit runs git fetch and returns git's summary output", async () => {
  const calls: string[][] = [];
  const runner = fakeRunner(
    {
      "fetch --prune": {
        stdout: "",
        stderr: "From github.com:acme/project\n   deadbee..feed123  main -> origin/main\n",
      },
    },
    calls
  );
  const { message } = await fetchGit("/repo", runner);
  assert.match(message, /deadbee\.\.feed123/);
  assert.deepEqual(calls, [["fetch", "--prune"]]);
});

test("fetchGit surfaces git errors with their stderr as detail", async () => {
  const runner = fakeRunner({
    "fetch --prune": { code: 128, stderr: "fatal: could not read from remote repository" },
  });
  await assert.rejects(
    fetchGit("/repo", runner),
    (error: unknown) =>
      error instanceof GitBranchError &&
      error.code === "GIT_COMMAND_FAILED" &&
      error.detail?.includes("could not read from remote repository")
  );
});
