import assert from "node:assert/strict";
import test from "node:test";
import {
  GitBranchError,
  checkoutGitBranch,
  checkoutRemoteBranch,
  createGitBranch,
  listGitBranches,
  validateBranchName,
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
      "branch --remotes --format=%(refname:short)": {
        stdout: "origin/HEAD\norigin/main\nupstream/feature/alpha\n",
      },
    },
    calls
  );
  const info = await listGitBranches("/repo", runner);
  assert.deepEqual(info, {
    isGitRepo: true,
    current: "main",
    branches: ["feature/alpha", "feature/zeta", "main"],
    remoteBranches: ["origin/main", "upstream/feature/alpha"],
  });
  assert.deepEqual(calls, [
    ["rev-parse", "--is-inside-work-tree"],
    ["rev-parse", "--abbrev-ref", "HEAD"],
    ["branch", "--format=%(refname:short)"],
    ["branch", "--remotes", "--format=%(refname:short)"],
  ]);
});

test("listGitBranches reports detached HEAD as no current branch", async () => {
  const runner = fakeRunner({
    "rev-parse --is-inside-work-tree": { stdout: "true\n" },
    "rev-parse --abbrev-ref HEAD": { stdout: "HEAD\n" },
    "branch --format=%(refname:short)": { stdout: "main\n" },
    "branch --remotes --format=%(refname:short)": { stdout: "origin/main\n" },
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
  assert.deepEqual(info, { isGitRepo: false, current: null, branches: [], remoteBranches: [] });
  assert.equal(calls.length, 1, "should not probe branches outside a repo");
});

test("checkoutGitBranch runs git checkout and surfaces git errors", async () => {
  const calls: string[][] = [];
  const runner = fakeRunner({ "checkout feature": { stdout: "" } }, calls);
  await checkoutGitBranch("/repo", "feature", runner);
  assert.deepEqual(calls, [["checkout", "feature"]]);

  const failing = fakeRunner({
    "checkout missing": { code: 1, stderr: "error: pathspec 'missing' did not match" },
  });
  await assert.rejects(
    checkoutGitBranch("/repo", "missing", failing),
    (error: unknown) =>
      error instanceof GitBranchError &&
      error.code === "GIT_COMMAND_FAILED" &&
      error.detail?.includes("pathspec")
  );
});

test("createGitBranch creates and optionally checks out", async () => {
  const calls: string[][] = [];
  const runner = fakeRunner({}, calls);
  await createGitBranch("/repo", "new-branch", { checkout: true }, runner);
  assert.deepEqual(calls, [
    ["branch", "new-branch"],
    ["checkout", "new-branch"],
  ]);

  const callsNoCheckout: string[][] = [];
  await createGitBranch("/repo", "other", {}, fakeRunner({}, callsNoCheckout));
  assert.deepEqual(callsNoCheckout, [["branch", "other"]]);
});

test("createGitBranch rejects invalid names without invoking git", async () => {
  const calls: string[][] = [];
  const runner = fakeRunner({}, calls);
  await assert.rejects(createGitBranch("/repo", "-bad", {}, runner), GitBranchError);
  await assert.rejects(createGitBranch("/repo", "a..b", {}, runner), GitBranchError);
  await assert.rejects(createGitBranch("/repo", " padded ", {}, runner), GitBranchError);
  assert.equal(calls.length, 0, "invalid names must not reach git");
});

test("checkoutRemoteBranch creates a tracking local branch", async () => {
  const calls: string[][] = [];
  const runner = fakeRunner({}, calls);
  await checkoutRemoteBranch("/repo", "origin/feature/nested", runner);
  assert.deepEqual(calls, [
    ["checkout", "-b", "feature/nested", "--track", "origin/feature/nested"],
  ]);

  const rejectCalls: string[][] = [];
  await assert.rejects(
    checkoutRemoteBranch("/repo", "origin", fakeRunner({}, rejectCalls)),
    (error: unknown) => error instanceof GitBranchError
  );
  await assert.rejects(
    checkoutRemoteBranch("/repo", "origin/", fakeRunner({}, rejectCalls)),
    (error: unknown) => error instanceof GitBranchError
  );
  assert.equal(rejectCalls.length, 0, "malformed refs must not reach git");
});

test("checkoutRemoteBranch falls back to plain checkout when the local branch exists", async () => {
  const calls: string[][] = [];
  const runner = fakeRunner(
    {
      "checkout -b main --track origin/main": {
        code: 128,
        stderr: "fatal: a branch named 'main' already exists",
      },
      "checkout main": { stdout: "Switched to branch 'main'\n" },
    },
    calls
  );
  await checkoutRemoteBranch("/repo", "origin/main", runner);
  assert.deepEqual(calls, [
    ["checkout", "-b", "main", "--track", "origin/main"],
    ["checkout", "main"],
  ]);
});

test("validateBranchName delegates to the shared branch name rules", () => {
  assert.equal(validateBranchName("feature/ok"), null);
  assert.equal(validateBranchName(""), "Branch name must not be empty");
  assert.match(validateBranchName("has space")!, /characters Git does not allow/);
  assert.equal(validateBranchName(" padded "), "Branch name must not have surrounding whitespace");
});
