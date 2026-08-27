import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { getRequestId, logApiError } from "@/lib/api-error";

/**
 * Locates the pi CLI entry script.
 *
 * `require.resolve` is not an option: the package's `exports` map does not
 * expose the bin file. Instead we probe known layouts:
 *   - PI_BIN env override (explicit, always wins)
 *   - <cwd>/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js
 *     (dev server runs from the project root; the standalone server runs
 *     from .next/standalone which carries its own node_modules)
 *   - plain "pi" from PATH (last resort)
 */
function resolvePiCommand(): { command: string; baseArgs: string[] } {
  if (process.env.PI_BIN) {
    return { command: process.execPath, baseArgs: [process.env.PI_BIN] };
  }
  const candidates = [
    join(
      process.cwd(),
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
      "dist",
      "bundle",
      "cli.js"
    ),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return { command: process.execPath, baseArgs: [p] };
    } catch {
      // ignore
    }
  }
  return { command: "pi", baseArgs: [] };
}

/**
 * POST /api/pi-update
 *
 * Runs `pi update --all` (updates pi + installed extensions) and streams the
 * combined stdout/stderr back as chunked plain text so the UI can show live
 * progress. The final line is a JSON status marker: {"__piUpdateDone":true,...}.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);

  const { command, baseArgs } = resolvePiCommand();
  const UPDATE_TIMEOUT_MS = 10 * 60 * 1000;

  try {
    const child = spawn(command, [...baseArgs, "update", "--all"], {
      cwd: process.cwd(),
      env: { ...process.env },
      windowsHide: true,
    });

    const encoder = new TextEncoder();
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, UPDATE_TIMEOUT_MS);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const push = (chunk: Buffer | string) => {
          try {
            controller.enqueue(encoder.encode(chunk.toString()));
          } catch {
            // controller closed - ignore
          }
        };

        child.stdout?.on("data", push);
        child.stderr?.on("data", push);
        child.on("error", (err) => {
          clearTimeout(timer);
          push(
            `\n${JSON.stringify({ __piUpdateDone: true, ok: false, code: null, error: `Failed to spawn pi: ${err.message}` })}\n`
          );
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          push(
            `\n${JSON.stringify({
              __piUpdateDone: true,
              ok: !killed && code === 0,
              code,
              error: killed ? `Timed out after ${UPDATE_TIMEOUT_MS / 60000} minutes` : null,
            })}\n`
          );
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel() {
        clearTimeout(timer);
        child.kill("SIGKILL");
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    logApiError({ route: "/api/pi-update", method: "POST", requestId, error });
    return NextResponse.json(
      { error: `Failed to start pi update: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
