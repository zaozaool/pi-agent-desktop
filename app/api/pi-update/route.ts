import { spawn } from "child_process";
import { readdirSync, statSync } from "fs";
import { delimiter, join, relative, resolve } from "path";
import { NextResponse } from "next/server";
import { getRequestId, logApiError } from "@/lib/api-error";

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** True when `dir` lies inside `root` (used to skip the app's own node_modules/.bin shim). */
function isInsidePath(root: string, dir: string): boolean {
  const rel = relative(resolve(root), resolve(dir));
  return rel !== "" && !rel.startsWith("..");
}

/**
 * Finds the user's *global* pi on PATH, skipping entries inside `skipRoot`.
 *
 * The dev server prepends `<project>/node_modules/.bin` to PATH, so a bare
 * `pi` lookup would hit the bundled copy - which `pi update` refuses to
 * self-update (it is not a global npm install).
 */
function findGlobalPiOnPath(skipRoot: string): string | null {
  const pathDirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const dir of pathDirs) {
    if (!dir) continue;
    if (isInsidePath(skipRoot, dir)) continue;
    for (const ext of exts) {
      const candidate = join(dir, `pi${ext}`);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Fallback for GUI launches where PATH is minimal (no nvm / user bins):
 * scan ~/.nvm/versions/node/<v>/bin/pi and pick the highest version.
 */
function findNvmPi(): string | null {
  if (process.platform === "win32") return null;
  const home = process.env.HOME;
  if (!home) return null;
  const versionsDir = join(home, ".nvm", "versions", "node");
  let best: { version: number[]; path: string } | null = null;
  try {
    for (const name of readdirSync(versionsDir)) {
      const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(name);
      const candidate = join(versionsDir, name, "bin", "pi");
      if (!m || !isFile(candidate)) continue;
      const version = m.slice(1).map(Number);
      if (!best || compareVersions(version, best.version) > 0) {
        best = { version, path: candidate };
      }
    }
  } catch {
    // no nvm installation
  }
  return best?.path ?? null;
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

interface ResolvedCommand {
  command: string;
  args: string[];
  /** Human-readable note streamed to the client before pi's output (null = none). */
  note: string | null;
}

/**
 * Locates the pi CLI to invoke for `pi update`.
 *
 * Order:
 *   1. PI_BIN env override (explicit, always wins)
 *   2. Global `pi` on PATH, skipping the app's own node_modules/.bin shim
 *      (dev servers prepend it to PATH; the bundled copy is not a global
 *      npm install and cannot self-update)
 *   3. nvm-managed global pi (~/.nvm/versions/node/<v>/bin/pi) - GUI
 *      launches inherit a minimal PATH without nvm
 *   4. Bundled copy (<cwd>/node_modules/...) as last resort, with a note
 *      explaining it cannot self-update
 */
function resolvePiUpdateCommand(): ResolvedCommand {
  const updateArgs = ["update", "--all"];

  if (process.env.PI_BIN) {
    return { command: process.execPath, args: [process.env.PI_BIN, ...updateArgs], note: null };
  }

  const globalPi = findGlobalPiOnPath(process.cwd()) ?? findNvmPi();
  if (globalPi) {
    if (process.platform === "win32" && /\.(cmd|exe)$/i.test(globalPi)) {
      // .cmd shims cannot be spawned without a shell (Node >= 20 EINVAL);
      // args are static constants so quoting is safe here.
      const comspec = process.env.ComSpec ?? "cmd.exe";
      return {
        command: comspec,
        args: ["/d", "/s", "/c", `"${globalPi}" ${updateArgs.join(" ")}`],
        note: `[pi-update] using ${globalPi}\n`,
      };
    }
    return { command: globalPi, args: updateArgs, note: `[pi-update] using ${globalPi}\n` };
  }

  const bundled = join(
    process.cwd(),
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "dist",
    "bundle",
    "cli.js"
  );
  if (isFile(bundled)) {
    return {
      command: process.execPath,
      args: [bundled, ...updateArgs],
      note:
        "[pi-update] no global pi found on PATH; falling back to the bundled copy, " +
        "which cannot self-update. Install pi globally (e.g. `npm i -g @earendil-works/pi-coding-agent`) and retry.\n",
    };
  }

  return {
    command: "pi",
    args: updateArgs,
    note: "[pi-update] no global pi found on PATH; trying bare `pi`.\n",
  };
}

/**
 * POST /api/pi-update
 *
 * Runs `pi update --all` (updates pi + installed extensions) and streams the
 * combined stdout/stderr back as chunked plain text so the UI can show live
 * progress. The final line is a JSON status marker with __piUpdateDone.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);

  const { command, args, note } = resolvePiUpdateCommand();
  const UPDATE_TIMEOUT_MS = 10 * 60 * 1000;

  try {
    const child = spawn(command, args, {
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

        if (note) push(note);

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
