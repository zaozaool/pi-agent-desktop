/**
 * @electron/universal realpath()s every file and compares relative paths.
 * If standalone/node_modules still contains symlinks that ESCAPE the
 * standalone tree (into the build machine's node_modules), x64 and arm64
 * temp apps sit at different depths, so the same target becomes two
 * different relative paths and the merge aborts:
 *
 *   uniqueToX64:   ../../../../../../../../Users/runner/.../semver/bin/semver.js
 *   uniqueToArm64: ../../../node_modules/.../semver/bin/semver.js
 *
 * Materialize only those escaping links (plus dangling ones) into real
 * copies before electron-builder copies extraResources into the .app.
 *
 * Links that resolve INSIDE the standalone tree are kept as symlinks:
 * Next/Turbopack vendors the pi runtime under .next/node_modules as
 * relative links into the top-level standalone node_modules (~150MB);
 * materializing them would duplicate the whole tree in every package.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  unlinkSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function collectSymlinks(root, found = []) {
  if (!existsSync(root)) return found;
  for (const name of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, name.name);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      found.push(path);
      continue;
    }
    if (stat.isDirectory()) collectSymlinks(path, found);
  }
  return found;
}

function escapes(rootDir, resolvedTarget) {
  const rel = relative(rootDir, resolvedTarget);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel);
}

/**
 * Materialize symlinks that resolve outside `root` (escaping links) and
 * drop dangling ones. Internal links are left in place. Repeat until the
 * tree is stable: materializing a link can surface new symlinks inside the
 * copied subtree.
 */
export function dereferenceSymlinks(root) {
  const rootDir = realpathSync(root);
  let replaced = 0;
  let removed = 0;
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;
    for (const link of collectSymlinks(rootDir)) {
      let target;
      try {
        target = realpathSync(link);
      } catch {
        target = null;
      }
      if (target && !escapes(rootDir, target)) continue;
      // unlink (not rmSync): Node >= 24.5 cannot remove dangling symlinks
      // with fs.rm due to its internal stat-based type check.
      unlinkSync(link);
      if (target) {
        cpSync(target, link, { recursive: true, force: true });
        replaced += 1;
      } else {
        removed += 1;
      }
      changed = true;
    }
    if (!changed) return { replaced, removed };
  }
  return { replaced, removed };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const standalone = join(process.cwd(), ".next", "standalone");
  if (!existsSync(standalone)) {
    console.error("dereference-standalone-symlinks: .next/standalone not found");
    process.exit(1);
  }
  const { replaced, removed } = dereferenceSymlinks(standalone);
  console.log(
    `dereference-standalone-symlinks: replaced ${replaced} escaping, removed ${removed} dangling (internal links kept)`,
  );
}
