/**
 * A Next.js standalone build only traces native optional dependencies for
 * the host architecture. macOS packaging therefore selects a target
 * architecture with the MAC_ARCH environment variable (unset or "host" by
 * default, or arm64 / x64 / universal) and this script aligns the standalone
 * tree with it:
 *
 * - arm64 / x64 (including the host default): keep exactly one Sharp +
 *   libvips pair for the target arch and drop the other one, prune the
 *   other arch's Pi TUI prebuilds, and drop arch-specific clipboard fallbacks
 *   (the universal clipboard binding covers both arches). This removes the
 *   dead native payload — the unused libvips dylib alone is ~19 MB.
 * - universal: keep arm64 and x64 packages side-by-side because Sharp selects
 *   the package using process.arch.
 *
 * Copy packages already installed for the host and fetch only the missing
 * architecture packages with `npm pack`. `npm install` cannot install an
 * x64-only optional package while running on Apple Silicon (EBADPLATFORM).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DARWIN_ARCHES = ["arm64", "x64"];
const MAC_ARCH_VALUES = new Set(["host", "universal", ...DARWIN_ARCHES]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Resolve the MAC_ARCH knob into a concrete packaging target. */
export function resolveMacArch(rawArch, hostArch) {
  const raw = typeof rawArch === "string" && rawArch.trim() !== "" ? rawArch.trim() : "host";
  if (!MAC_ARCH_VALUES.has(raw)) {
    throw new Error(
      `MAC_ARCH must be one of ${[...MAC_ARCH_VALUES].join(", ")}; got "${rawArch}"`,
    );
  }
  if (raw === "host") {
    if (!DARWIN_ARCHES.includes(hostArch)) {
      throw new Error(`host architecture ${hostArch} is not a supported macOS target`);
    }
    return hostArch;
  }
  return raw;
}

/** List the Sharp optional packages the target arch needs, validated strictly. */
export function requiredDarwinSharpPackages(sharpManifest, macArch) {
  if (!MAC_ARCH_VALUES.has(macArch)) {
    throw new Error(`macArch must be one of ${[...MAC_ARCH_VALUES].join(", ")}; got ${macArch}`);
  }
  const expectedNames =
    macArch === "universal"
      ? DARWIN_ARCHES.flatMap((arch) => [
          `@img/sharp-darwin-${arch}`,
          `@img/sharp-libvips-darwin-${arch}`,
        ])
      : [`@img/sharp-darwin-${macArch}`, `@img/sharp-libvips-darwin-${macArch}`];

  const packages = Object.entries(sharpManifest.optionalDependencies ?? {})
    .filter(([name]) => expectedNames.includes(name))
    .map(([name, version]) => ({ name, version }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const actualNames = packages.map(({ name }) => name);
  const sortedExpected = [...expectedNames].sort((left, right) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(actualNames) !== JSON.stringify(sortedExpected)) {
    throw new Error(
      `expected Sharp optional dependencies ${sortedExpected.join(", ")}; got ${actualNames.join(", ")}`,
    );
  }

  return packages;
}

function packageDirectory(nodeModules, name) {
  return join(nodeModules, ...name.split("/"));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.captureStdout ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${basename(command)} exited with status ${result.status}`);
  }
  return result.stdout ?? "";
}

function npmPack(spec, destination, cwd) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : "npm";
  const prefixArgs = npmExecPath ? [npmExecPath] : [];
  const stdout = run(
    command,
    [...prefixArgs, "pack", spec, "--json", "--pack-destination", destination],
    { cwd, captureStdout: true },
  );
  const result = JSON.parse(stdout);
  const filename = result?.[0]?.filename;
  if (typeof filename !== "string" || !filename.endsWith(".tgz")) {
    throw new Error(`npm pack did not return a tarball filename for ${spec}`);
  }
  return join(destination, filename);
}

function extractPackage(archive, destination) {
  mkdirSync(destination, { recursive: true });
  run("tar", ["-xzf", archive, "-C", destination, "--strip-components=1"]);
}

/**
 * Locate every arch-specific native layout inside the standalone tree,
 * including packages nested inside other packages' node_modules (pi-tui can
 * be hoisted to the top level or nested inside pi-coding-agent).
 */
function collectMacNativeLayouts(standaloneNodeModules) {
  const layouts = { darwinSharp: [], piTui: [], clipboardArch: [] };

  const scopedTargets = {
    "@img": {
      "sharp-darwin-arm64": (dir) => layouts.darwinSharp.push({ name: "@img/sharp-darwin-arm64", dir }),
      "sharp-darwin-x64": (dir) => layouts.darwinSharp.push({ name: "@img/sharp-darwin-x64", dir }),
      "sharp-libvips-darwin-arm64": (dir) =>
        layouts.darwinSharp.push({ name: "@img/sharp-libvips-darwin-arm64", dir }),
      "sharp-libvips-darwin-x64": (dir) =>
        layouts.darwinSharp.push({ name: "@img/sharp-libvips-darwin-x64", dir }),
    },
    "@earendil-works": {
      "pi-tui": (dir) => layouts.piTui.push(dir),
    },
    "@mariozechner": {
      "clipboard-darwin-arm64": (dir) =>
        layouts.clipboardArch.push({ arch: "arm64", dir }),
      "clipboard-darwin-x64": (dir) => layouts.clipboardArch.push({ arch: "x64", dir }),
    },
  };

  const visitContainer = (containerDir, depth) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = readdirSync(containerDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = join(containerDir, entry.name);
      if (entry.name.startsWith("@")) {
        visitScope(child, entry.name, depth);
      } else {
        descendIntoPackage(child, depth);
      }
    }
  };

  const visitScope = (scopeDir, scopeName, depth) => {
    const targets = scopedTargets[scopeName];
    let entries;
    try {
      entries = readdirSync(scopeDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = join(scopeDir, entry.name);
      targets?.[entry.name]?.(child, layouts);
      descendIntoPackage(child, depth);
    }
  };

  const descendIntoPackage = (packageDir, depth) => {
    const nested = join(packageDir, "node_modules");
    if (isDirectory(nested)) visitContainer(nested, depth + 1);
  };

  visitContainer(standaloneNodeModules, 0);
  return layouts;
}

export function ensureStandaloneMacRuntimes(projectRoot) {
  const sourceNodeModules = join(projectRoot, "node_modules");
  const standaloneNodeModules = join(projectRoot, ".next", "standalone", "node_modules");
  const sharpManifestPath = join(standaloneNodeModules, "sharp", "package.json");
  if (!existsSync(sharpManifestPath)) {
    throw new Error(
      "standalone sharp package not found (run next build before preparing macOS runtimes)",
    );
  }

  const macArch = resolveMacArch(process.env.MAC_ARCH, process.arch);
  const requiredPackages = requiredDarwinSharpPackages(readJson(sharpManifestPath), macArch);
  const requiredNames = new Set(requiredPackages.map(({ name }) => name));
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "pi-agent-macos-runtimes-"));
  let copied = 0;
  let fetched = 0;
  let pruned = 0;

  try {
    for (const { name, version } of requiredPackages) {
      const destination = packageDirectory(standaloneNodeModules, name);
      const destinationManifest = join(destination, "package.json");
      if (existsSync(destinationManifest)) {
        const installed = readJson(destinationManifest);
        if (installed.version !== version) {
          throw new Error(
            `${name} version mismatch in standalone: expected ${version}, got ${installed.version}`,
          );
        }
        continue;
      }

      const source = packageDirectory(sourceNodeModules, name);
      if (existsSync(join(source, "package.json"))) {
        cpSync(source, destination, { recursive: true, force: true });
        copied += 1;
      } else {
        const archive = npmPack(`${name}@${version}`, temporaryDirectory, projectRoot);
        extractPackage(archive, destination);
        fetched += 1;
      }

      const installed = readJson(destinationManifest);
      if (installed.name !== name || installed.version !== version) {
        throw new Error(`invalid package extracted for ${name}@${version}`);
      }
    }

    if (macArch !== "universal") {
      const otherArch = macArch === "arm64" ? "x64" : "arm64";
      const layouts = collectMacNativeLayouts(standaloneNodeModules);

      // Sharp: drop the pair for the architecture we are not packaging.
      for (const { name, dir } of layouts.darwinSharp) {
        if (requiredNames.has(name)) continue;
        rmSync(dir, { recursive: true, force: true });
        pruned += 1;
      }

      // Pi TUI prebuilds: keep only the target arch directory.
      for (const piTuiDir of layouts.piTui) {
        const otherPrebuild = join(piTuiDir, "native", "darwin", "prebuilds", `darwin-${otherArch}`);
        if (existsSync(otherPrebuild)) {
          rmSync(otherPrebuild, { recursive: true, force: true });
          pruned += 1;
        }
      }

      // Clipboard: the universal binding covers both arches; drop the
      // fallback for the architecture we are not packaging.
      for (const { arch, dir } of layouts.clipboardArch) {
        if (arch === macArch) continue;
        rmSync(dir, { recursive: true, force: true });
        pruned += 1;
      }
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(
    `ensure-standalone-macos-runtimes: ready (arch=${macArch}; ${copied} copied, ${fetched} fetched, ${pruned} pruned)`,
  );
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  if (process.platform !== "darwin") {
    console.log("ensure-standalone-macos-runtimes: skipped (not macOS)");
  } else {
    try {
      ensureStandaloneMacRuntimes(process.cwd());
    } catch (error) {
      console.error(
        `ensure-standalone-macos-runtimes: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  }
}
