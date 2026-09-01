/**
 * Next.js standalone tracing can copy an external Pi package without its
 * production dependencies. Copy the complete installed runtime dependency
 * closure while preserving npm's node_modules layout.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const roots = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"];

/**
 * npm's .bin entries are absolute symlinks into this machine's repo. In the
 * packaged app they dangle, and they break @electron/universal's mach-o merge
 * ("the number of mach-o files is not the same between the arm64 and x64
 * builds") because the x64 copy is scanned from a temp directory at a
 * different path depth. Node 24's fs.cpSync dereference option does not work,
 * so flatten escaping symlinks manually: replace each one with a real copy of
 * its target. Internal (in-tree) symlinks are kept - they resolve identically
 * once the whole standalone tree is relocated into the app bundle.
 *
 * Returns the list of flattened link paths relative to rootDir.
 */
export function flattenEscapingSymlinks(rootDirInput) {
  const rootDir = realpathSync(rootDirInput);
  const escapes = (resolved) => {
    const rel = relative(rootDir, resolved);
    return rel === "" || rel.startsWith("..");
  };

  const flattened = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (!lstatSync(p).isSymbolicLink()) {
        if (lstatSync(p).isDirectory()) walk(p);
        continue;
      }

      let resolved;
      try {
        resolved = realpathSync(p);
      } catch {
        // Dangling link: only remove it when it could not have been valid
        // anywhere (absolute target). Relative ones may still resolve once
        // the rest of the tree is populated.
        if (readlinkSync(p).startsWith("/")) {
          // unlink (not rmSync): Node >= 24.5 cannot remove dangling symlinks
          // with fs.rm due to its internal stat-based type check.
          unlinkSync(p);
          flattened.push(relative(rootDir, p));
        }
        continue;
      }
      if (!escapes(resolved)) continue;

      unlinkSync(p);
      cpSync(resolved, p, { recursive: true, force: true });
      flattened.push(relative(rootDir, p));
      // The replacement may itself be a directory containing symlinks.
      if (lstatSync(p).isDirectory()) walk(p);
    }
  };
  walk(rootDir);
  return flattened;
}

function packageDirectory(name, fromDirectory) {
  let current = fromDirectory;
  const packageParts = name.split("/");

  while (true) {
    const candidate = join(current, "node_modules", ...packageParts);
    if (existsSync(join(candidate, "package.json"))) return candidate;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readManifest(directory) {
  return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
}

export function ensureStandalonePiRuntime(projectRoot) {
  const sourceNodeModules = join(projectRoot, "node_modules");
  const standaloneNodeModules = join(projectRoot, ".next", "standalone", "node_modules");

  if (!existsSync(standaloneNodeModules)) {
    throw new Error(".next/standalone/node_modules not found");
  }

  const queue = roots.map((name) => ({
    name,
    directory: packageDirectory(name, projectRoot),
    required: true,
  }));
  const visited = new Set();
  let copied = 0;

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item.directory) {
      if (item.required) {
        throw new Error(`required package ${item.name} not found`);
      }
      continue;
    }

    const sourceDirectory = realpathSync(item.directory);
    if (visited.has(sourceDirectory)) continue;
    visited.add(sourceDirectory);

    const relativeDirectory = relative(sourceNodeModules, sourceDirectory);
    if (relativeDirectory.startsWith("..")) {
      throw new Error(`package escaped node_modules: ${sourceDirectory}`);
    }

    // Remove first so re-runs are idempotent: a previous run may have
    // flattened a .bin symlink into a real file, and copying a symlink onto
    // that path fails with EEXIST.
    rmSync(join(standaloneNodeModules, relativeDirectory), { recursive: true, force: true });
    cpSync(sourceDirectory, join(standaloneNodeModules, relativeDirectory), {
      recursive: true,
      force: true,
    });
    copied += 1;

    const manifest = readManifest(sourceDirectory);
    const requiredDependencies = Object.keys(manifest.dependencies ?? {});
    const optionalDependencies = Object.keys(manifest.optionalDependencies ?? {});
    const peerDependencies = Object.keys(manifest.peerDependencies ?? {});

    for (const dependency of requiredDependencies) {
      queue.push({
        name: dependency,
        directory: packageDirectory(dependency, sourceDirectory),
        required: true,
      });
    }
    for (const dependency of [...optionalDependencies, ...peerDependencies]) {
      queue.push({
        name: dependency,
        directory: packageDirectory(dependency, sourceDirectory),
        required: false,
      });
    }
  }

  const flattened = flattenEscapingSymlinks(join(projectRoot, ".next", "standalone"));

  // Safety net: fail the build early if any symlink still points outside the
  // standalone, so this surfaces as a clear message instead of a cryptic
  // universal-merge failure later.
  const escaping = flattenEscapingSymlinksDryRun(join(projectRoot, ".next", "standalone"));
  if (escaping.length > 0) {
    throw new Error(`symlinks escaping the standalone remain: ${escaping.join(", ")}`);
  }

  return { copied, flattened };
}

function flattenEscapingSymlinksDryRun(rootDirInput) {
  const rootDir = realpathSync(rootDirInput);
  const escapes = (resolved) => {
    const rel = relative(rootDir, resolved);
    return rel === "" || rel.startsWith("..");
  };

  const escaping = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) {
        if (readlinkSync(p).startsWith("/")) {
          escaping.push(relative(rootDir, p));
          continue;
        }
        try {
          if (escapes(realpathSync(p))) escaping.push(relative(rootDir, p));
        } catch {
          // dangling relative link - cannot classify, leave it
        }
      } else if (st.isDirectory()) {
        walk(p);
      }
    }
  };
  walk(rootDir);
  return escaping;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { copied, flattened } = ensureStandalonePiRuntime(process.cwd());
    console.log(`ensure-standalone-pi-runtime: copied ${copied} runtime packages`);
    console.log(`ensure-standalone-pi-runtime: flattened ${flattened.length} escaping symlinks`);
  } catch (error) {
    console.error(`ensure-standalone-pi-runtime: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
