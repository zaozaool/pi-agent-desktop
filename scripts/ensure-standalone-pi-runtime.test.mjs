import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flattenEscapingSymlinks, repairHashedExternalLinks } from "./ensure-standalone-pi-runtime.mjs";

function makeSandbox() {
  const dir = join(tmpdir(), `pi-runtime-flatten-${process.pid}-${Date.now()}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "app", "node_modules", ".bin"), { recursive: true });
  mkdirSync(join(dir, "app", "pkg"), { recursive: true });
  mkdirSync(join(dir, "outside"), { recursive: true });
  writeFileSync(join(dir, "app", "pkg", "cli.js"), "console.log('inside')\n");
  writeFileSync(join(dir, "outside", "tool.js"), "console.log('outside')\n");
  return dir;
}

test("flattens absolute symlinks that escape the standalone", () => {
  const dir = makeSandbox();
  try {
    symlinkSync(join(dir, "outside", "tool.js"), join(dir, "app", "node_modules", ".bin", "tool"));
    // npm .bin entries also carry an exec bit; keep parity by checking content
    const flattened = flattenEscapingSymlinks(join(dir, "app"));

    assert.deepEqual(flattened, [join("node_modules", ".bin", "tool")]);
    const replaced = join(dir, "app", "node_modules", ".bin", "tool");
    assert.equal(readFileSync(replaced, "utf8"), "console.log('outside')\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("flattens relative symlinks that resolve outside the standalone", () => {
  const dir = makeSandbox();
  try {
    symlinkSync("../../../outside/tool.js", join(dir, "app", "node_modules", ".bin", "tool"));
    const flattened = flattenEscapingSymlinks(join(dir, "app"));

    assert.deepEqual(flattened, [join("node_modules", ".bin", "tool")]);
    const replaced = join(dir, "app", "node_modules", ".bin", "tool");
    assert.equal(readFileSync(replaced, "utf8"), "console.log('outside')\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeps internal symlinks and removes dangling absolute ones", () => {
  const dir = makeSandbox();
  try {
    // internal: resolves inside the app tree
    symlinkSync("../../pkg/cli.js", join(dir, "app", "node_modules", ".bin", "internal"));
    // dangling absolute: target does not exist
    symlinkSync(join(dir, "outside", "missing.js"), join(dir, "app", "node_modules", ".bin", "dangling"));

    const flattened = flattenEscapingSymlinks(join(dir, "app"));

    assert.deepEqual(flattened, [join("node_modules", ".bin", "dangling")]);
    assert.ok(existsSync(join(dir, "app", "node_modules", ".bin", "internal")), "internal link must survive");
    assert.ok(!existsSync(join(dir, "app", "node_modules", ".bin", "dangling")), "dangling absolute link must be removed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("repairs package.json-only traced external stubs behind hashed links", () => {
  // Layout mirrors the real standalone:
  //   <root>/node_modules/<pkg>/            complete repo package
  //   <root>/standalone/node_modules/<pkg>/ traced stub (package.json only)
  //   <root>/standalone/.next/node_modules/<pkg>-<hash> -> ../../../node_modules/<pkg>
  const dir = join(tmpdir(), `pi-runtime-test-${process.pid}-${Date.now()}`);
  mkdirSync(join(dir, "repo", "node_modules", "@scope", "pkg", "dist"), { recursive: true });
  writeFileSync(join(dir, "repo", "node_modules", "@scope", "pkg", "package.json"), '{"dependencies":{"dep":"1.0.0"}}');
  mkdirSync(join(dir, "repo", "node_modules", "dep"), { recursive: true });
  writeFileSync(join(dir, "repo", "node_modules", "dep", "package.json"), "{}");
  writeFileSync(join(dir, "repo", "node_modules", "@scope", "pkg", "dist", "index.js"), "export {};\n");

  const standaloneNodeModules = join(dir, "standalone", "node_modules");
  // Hashed external links live under the standalone's own .next dir.
  mkdirSync(join(dir, "standalone", ".next", "node_modules", "@scope"), { recursive: true });
  mkdirSync(join(standaloneNodeModules, "@scope", "pkg"), { recursive: true });
  writeFileSync(join(standaloneNodeModules, "@scope", "pkg", "package.json"), "{}");

  symlinkSync(
    "../../../node_modules/@scope/pkg",
    join(dir, "standalone", ".next", "node_modules", "@scope", "pkg-abc123")
  );

  try {
    const queue = [];
    const repaired = repairHashedExternalLinks(standaloneNodeModules, join(dir, "repo", "node_modules"), queue);
    assert.equal(repaired, 1);
    assert.ok(existsSync(join(standaloneNodeModules, "@scope", "pkg", "dist", "index.js")), "stub must be replaced by full copy");
    assert.deepEqual(queue.map((q) => q.name), ["dep"], "package deps must be seeded into the closure queue");

    // Idempotent: a complete copy is not re-copied.
    assert.equal(repairHashedExternalLinks(standaloneNodeModules, join(dir, "repo", "node_modules")), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
