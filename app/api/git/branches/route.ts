import { NextResponse } from "next/server";
import { errorMessage, getRequestId, logApiError } from "@/lib/api-error";
import { isPathAllowedAsync } from "@/lib/allowed-roots";
import { GitBranchError, fetchGit, listGitBranches } from "@/lib/git-branches";

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
    const body = (await req.json()) as { cwd?: string };
    const cwd = body.cwd?.trim();
    if (!cwd) {
      return NextResponse.json({ error: "Missing cwd" }, { status: 400 });
    }
    if (!(await isPathAllowedAsync(cwd))) {
      return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    }
    const info = await listGitBranches(cwd);
    if (!info.isGitRepo) {
      // Not a git repo: nothing to fetch, not an error either.
      return NextResponse.json(info);
    }
    const { message } = await fetchGit(cwd);
    const refreshed = await listGitBranches(cwd);
    return NextResponse.json({ ...refreshed, message });
  } catch (error) {
    if (error instanceof GitBranchError) {
      return NextResponse.json(
        { error: error.detail ?? error.message, code: error.code },
        { status: 409 }
      );
    }
    logApiError({ route: "/api/git/branches", method: "POST", requestId, error });
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
