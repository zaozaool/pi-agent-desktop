/**
 * Cross-platform `next build` launcher.
 *
 * `next build` must not run with `__NEXT_PRIVATE_STANDALONE_CONFIG` in the
 * environment: that variable (leaked by the packaged app's embedded Next
 * server, e.g. when dist is built from a shell spawned inside the app) makes
 * next's loadConfigImpl return the JSON-serialized standalone config and skip
 * default merging, so `config.generateBuildId` is undefined and the build dies
 * with "TypeError: generate is not a function". `__NEXT_PRIVATE_ORIGIN` is a
 * dev-server marker for the same reason.
 *
 * Strips both, then execs the real Next CLI in a child process (stdio
 * inherited, exit code forwarded) — works on macOS, Linux and Windows.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

for (const key of ["__NEXT_PRIVATE_STANDALONE_CONFIG", "__NEXT_PRIVATE_ORIGIN"]) {
  delete process.env[key];
}

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
