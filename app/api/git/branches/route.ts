import { NextResponse } from "next/server";
import { errorMessage, getRequestId, logApiError } from "@/lib/api-error";
import { isPathAllowedAsync } from "@/lib/allowed-roots";
import {
  GitBranchError,
  checkoutGitBranch,
  checkoutRemoteBranch,
  createGitBranch,
  listGitBranches,
} from "@/lib/git-branches";

export const dynamic = "force-dynamic";

function resolvePath(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const cwd = resolvePath(new URL(req.url).searchParams.get("cwd"));
    if (!cwd) {
      return NextResponse.json({ error: "Missing cwd" }, { status: 400 });
    }
    if (!(await isPathAllowedAsync(cwd))) {
      return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    }
    const info = await listGitBranches(cwd);
    return NextResponse.json(info);
  } catch (error) {
    if (error instanceof GitBranchError) {
      return NextResponse.json(
        { error: error.detail ?? error.message, code: error.code },
        { status: 409 }
      );
    }
    logApiError({ route: "/api/git/branches", method: "GET", requestId, error });
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = (await req.json()) as {
      cwd?: string;
      action?: "checkout" | "create";
      branch?: string;
    };
    const cwd = body.cwd?.trim();
    const branch = body.branch?.trim();
    if (!cwd || !branch) {
      return NextResponse.json({ error: "Missing cwd or branch" }, { status: 400 });
    }
    if (!(await isPathAllowedAsync(cwd))) {
      return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    }
    if (body.action === "create") {
      await createGitBranch(cwd, branch, { checkout: true });
    } else {
      // Dispatch on the ref's shape: a known local branch gets a plain
      // checkout, a remote-tracking ref gets a tracking branch created.
      const info = await listGitBranches(cwd);
      if (info.branches.includes(branch)) {
        await checkoutGitBranch(cwd, branch);
      } else if (info.remoteBranches.includes(branch)) {
        await checkoutRemoteBranch(cwd, branch);
      } else {
        return NextResponse.json(
          { error: `Unknown branch: ${branch}`, code: "UNKNOWN_BRANCH" },
          { status: 409 }
        );
      }
    }
    const info = await listGitBranches(cwd);
    return NextResponse.json(info);
  } catch (error) {
    if (error instanceof GitBranchError) {
      // Invalid names are a client problem; git failures (dirty tree, unknown
      // branch) are 409 conflicts carrying git's own stderr for display.
      const status = error.code === "INVALID_BRANCH_NAME" ? 400 : 409;
      return NextResponse.json(
        { error: error.detail ?? error.message, code: error.code },
        { status }
      );
    }
    logApiError({ route: "/api/git/branches", method: "POST", requestId, error });
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
