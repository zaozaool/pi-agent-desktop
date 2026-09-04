import { execFile } from "node:child_process";
import { validateWorktreeBranchName } from "./git-worktree.ts";

export type GitBranchesInfo = {
  isGitRepo: boolean;
  /** Currently checked out branch, or null when detached / not a repo */
  current: string | null;
  branches: string[];
  /** Local remote-tracking refs (origin/...), sorted; excludes origin/HEAD */
  remoteBranches: string[];
};

export type GitRunner = (
  args: string[],
  options: { cwd: string }
) => Promise<{ code: number; stdout: string; stderr: string }>;

export class GitBranchError extends Error {
  code:
    | "GIT_UNAVAILABLE"
    | "NOT_GIT_REPOSITORY"
    | "GIT_COMMAND_FAILED"
    | "INVALID_BRANCH_NAME";

  detail?: string;

  constructor(
    code: GitBranchError["code"],
    message: string,
    detail?: string
  ) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export const DEFAULT_GIT_BRANCH_RUNNER: GitRunner = (args, options) =>
  new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: options.cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({ code: 127, stdout: "", stderr: "git is not installed" });
          return;
        }
        // git writes to stderr even on success for some informational paths;
        // rely on the exit code carried on the error object.
        const code = error && typeof (error as { code?: unknown }).code === "number"
          ? ((error as { code: number }).code)
          : error ? 1 : 0;
        resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      }
    );
  });

function toError(result: {
  code: number;
  stderr: string;
}): GitBranchError {
  if (result.code === 127) {
    return new GitBranchError("GIT_UNAVAILABLE", "git is not available");
  }
  return new GitBranchError(
    "GIT_COMMAND_FAILED",
    "git command failed",
    result.stderr.trim() || `exit code ${result.code}`
  );
}

export async function listGitBranches(
  cwd: string,
  runner: GitRunner = DEFAULT_GIT_BRANCH_RUNNER
): Promise<GitBranchesInfo> {
  const inside = await runner(["rev-parse", "--is-inside-work-tree"], { cwd });
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
  return { isGitRepo: false, current: null, branches: [], remoteBranches: [] };
  }

  const [head, branchList, remoteList] = await Promise.all([
    runner(["rev-parse", "--abbrev-ref", "HEAD"], { cwd }),
    runner(["branch", "--format=%(refname:short)"], { cwd }),
    runner(["branch", "--remotes", "--format=%(refname:short)"], { cwd }),
  ]);
  if (head.code !== 0) throw toError(head);
  if (branchList.code !== 0) throw toError(branchList);
  if (remoteList.code !== 0) throw toError(remoteList);

  const ref = head.stdout.trim();
  const branches = branchList.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const remoteBranches = remoteList.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    // symref origin/HEAD points at the default branch, not a real checkout target
    .filter((line) => !line.endsWith("/HEAD"))
    .sort((a, b) => a.localeCompare(b));

  return {
    isGitRepo: true,
    // "HEAD" means a detached checkout; worktrees show their checked-out
    // branch here as well since `branch` is repo-wide but HEAD is per-worktree.
    current: ref && ref !== "HEAD" ? ref : null,
    branches,
    remoteBranches,
  };
}

export async function checkoutGitBranch(
  cwd: string,
  branch: string,
  runner: GitRunner = DEFAULT_GIT_BRANCH_RUNNER
): Promise<void> {
  assertValidBranchName(branch);
  const result = await runner(["checkout", branch], { cwd });
  if (result.code !== 0) throw toError(result);
}

/**
 * Checks out a remote-tracking ref (e.g. "origin/feature"). When no local
 * branch with the same short name exists this creates one that tracks the
 * remote ref; git falls back to a plain checkout if it already exists.
 */
export async function checkoutRemoteBranch(
  cwd: string,
  remoteRef: string,
  runner: GitRunner = DEFAULT_GIT_BRANCH_RUNNER
): Promise<void> {
  const slash = remoteRef.indexOf("/");
  if (slash <= 0 || slash === remoteRef.length - 1) {
    throw new GitBranchError("INVALID_BRANCH_NAME", `Not a remote branch: ${remoteRef}`);
  }
  const shortName = remoteRef.slice(slash + 1);
  const create = await runner(
    ["checkout", "-b", shortName, "--track", remoteRef],
    { cwd }
  );
  if (create.code === 0) return;
  // A local branch with that name may already exist; plain checkout then.
  const fallback = await runner(["checkout", shortName], { cwd });
  if (fallback.code !== 0) throw toError(fallback);
}

export async function createGitBranch(
  cwd: string,
  name: string,
  options: { checkout?: boolean } = {},
  runner: GitRunner = DEFAULT_GIT_BRANCH_RUNNER
): Promise<void> {
  assertValidBranchName(name);
  const create = await runner(["branch", name], { cwd });
  if (create.code !== 0) throw toError(create);
  if (options.checkout) {
    const switchResult = await runner(["checkout", name], { cwd });
    if (switchResult.code !== 0) throw toError(switchResult);
  }
}

/** Returns an error message when the name is unusable, null otherwise. */
export function validateBranchName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed !== name) {
    return "Branch name must not have surrounding whitespace";
  }
  return validateWorktreeBranchName(trimmed);
}

function assertValidBranchName(name: string): void {
  const message = validateBranchName(name);
  if (message) {
    throw new GitBranchError("INVALID_BRANCH_NAME", message);
  }
}
