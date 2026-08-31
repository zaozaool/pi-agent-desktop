#!/usr/bin/env node
/**
 * Thin wrapper around electron-builder for macOS packaging.
 *
 * The target architecture is selected with the MAC_ARCH environment variable:
 * unset or "host" (the default) builds for the machine running the build,
 * while "arm64", "x64" and "universal" map to the matching electron-builder
 * architecture flags. MAC_ARCH is also read by
 * scripts/ensure-standalone-macos-runtimes.mjs during build:standalone, so
 * the standalone natives always match the packaged app.
 *
 * All remaining arguments are forwarded to electron-builder (e.g. --dir,
 * --publish never).
 */
import { spawn } from "node:child_process";

const MAC_ARCH_FLAGS = {
  host: [],
  arm64: ["--arm64"],
  x64: ["--x64"],
  universal: ["--universal"],
};

const rawArch = process.env.MAC_ARCH?.trim() || "host";
const archFlags = MAC_ARCH_FLAGS[rawArch];
if (!archFlags) {
  console.error(
    `electron-builder-mac: MAC_ARCH must be one of ${Object.keys(MAC_ARCH_FLAGS).join(", ")}; got "${process.env.MAC_ARCH}"`,
  );
  process.exit(1);
}

const forwardedArgs = process.argv.slice(2);
const conflictingFlags = new Set([
  "--ia32",
  "--armv7l",
  "--arm64",
  "--x64",
  "--universal",
]);
if (forwardedArgs.some((arg) => conflictingFlags.has(arg))) {
  console.error(
    "electron-builder-mac: pass the architecture via MAC_ARCH, not via electron-builder flags",
  );
  process.exit(1);
}

const child = spawn("npx", ["electron-builder", "--mac", ...archFlags, ...forwardedArgs], {
  stdio: "inherit",
  windowsHide: true,
});

child.once("error", (error) => {
  console.error(`electron-builder-mac: ${error.message}`);
  process.exit(1);
});

child.once("close", (code) => {
  process.exit(code ?? 1);
});
