import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flattenEscapingSymlinks } from "./ensure-standalone-pi-runtime.mjs";

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
