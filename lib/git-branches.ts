import { execFile } from "node:child_process";

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
  code: "GIT_UNAVAILABLE" | "GIT_COMMAND_FAILED";
  detail?: string;

  constructor(code: GitBranchError["code"], message: string, detail?: string) {
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
    // %(refname:short) shortens the origin/HEAD symref to bare "origin"; a
    // real remote branch always looks like <remote>/<branch>.
    .filter((line) => line.includes("/") && !line.endsWith("/HEAD"))
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

/**
 * Runs `git fetch --prune` in the given directory. Resolves with git's
 * summary output (from stderr, where fetch reports progress); rejects with
 * GitBranchError carrying git's stderr on failure.
 */
export async function fetchGit(
  cwd: string,
  runner: GitRunner = DEFAULT_GIT_BRANCH_RUNNER
): Promise<{ message: string }> {
  const result = await runner(["fetch", "--prune"], { cwd });
  if (result.code !== 0) throw toError(result);
  return { message: result.stderr.trim() };
}
