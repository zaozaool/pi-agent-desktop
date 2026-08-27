import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { NextResponse } from "next/server";
import { errorMessage, getRequestId, logApiError } from "@/lib/api-error";
import { getAllowedRoots, isPathAllowed } from "@/lib/allowed-roots";

const execFileAsync = promisify(execFile);

/**
 * POST /api/open-directory  { path: string }
 *
 * Reveals a directory in the OS file manager (Finder / Explorer / xdg-open).
 * The path is resolved via realpath and validated against allowedRoots first -
 * same guard as the files API - so this cannot be used to probe arbitrary
 * filesystem locations.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: { "x-request-id": requestId } }
    );
  }

  const dirPath = body.path?.trim();
  if (!dirPath) {
    return NextResponse.json(
      { error: "Missing 'path'" },
      { status: 400, headers: { "x-request-id": requestId } }
    );
  }

  try {
    const realPath = await fs.promises.realpath(dirPath);
    const stat = await fs.promises.stat(realPath);
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: "Not a directory" },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const allowedRoots = await getAllowedRoots();
    if (!isPathAllowed(realPath, allowedRoots)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403, headers: { "x-request-id": requestId } }
      );
    }

    const command =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    await execFileAsync(command, [realPath], { timeout: 10_000, windowsHide: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError({ route: "/api/open-directory", method: "POST", requestId, error });
    return NextResponse.json(
      { error: `Failed to open directory: ${errorMessage(error)}` },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
