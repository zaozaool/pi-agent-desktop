import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { minimatch } from "minimatch";
import {
  ELECTRON_UPDATER_RUNTIME_PACKAGES,
  missingFromBuilderConfig,
  missingFromNodeModules,
} from "./electron-updater-runtime-deps.mjs";

const config = readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("electron updater runtime dependencies are packaged with the Electron app", () => {
  for (const packageName of ELECTRON_UPDATER_RUNTIME_PACKAGES) {
    const escapedName = packageName.replace(".", "\\.");
    assert.match(config, new RegExp(`from: node_modules/${escapedName}`));
    assert.match(config, new RegExp(`to: app/node_modules/${escapedName}`));
  }
});

test("electron-builder.yml is not missing any required updater runtime packages", () => {
  assert.deepEqual(missingFromBuilderConfig(config), []);
});

test("electron-updater runtime packages resolve from project node_modules", () => {
  assert.deepEqual(missingFromNodeModules(projectRoot), []);
});

function standaloneExtraResourcesBlock(source) {
  const start = source.indexOf("- from: .next/standalone\n");
  const end = source.indexOf("- from: .next/standalone/node_modules");
  assert.ok(start !== -1, "standalone extraResources entry expected");
  assert.ok(end !== -1 && end > start, "standalone/node_modules entry expected after standalone entry");
  return source.slice(start, end);
}

test("standalone extraResources filter excludes test files from the installer", () => {
  const block = standaloneExtraResourcesBlock(config);
  for (const pattern of [
    "!**/*.test.ts",
    "!**/*.test.tsx",
    "!**/*.test.mjs",
    "!**/*.test.js",
  ]) {
    assert.ok(
      block.includes(`- "${pattern}"`),
      `standalone filter must contain ${pattern}`
    );
  }
});

function macBlock(source) {
  const start = source.indexOf("mac:\n");
  const end = source.indexOf("dmg:\n");
  assert.ok(start !== -1, "mac block expected");
  assert.ok(end !== -1 && end > start, "dmg block expected after mac block");
  return source.slice(start, end);
}

test("macOS packaging emits a single DMG target without baking in an architecture", () => {
  const block = macBlock(config);
  assert.ok(block.includes("- dmg"), "dmg target expected");
  assert.ok(!block.includes("zip"), "zip must not be a mac target (dmg-only packaging)");
  assert.ok(
    !/\barch:\b/.test(block),
    "mac.target must not pin an architecture; MAC_ARCH drives the electron-builder arch flags",
  );
  assert.match(config, /icon: build\/icon\.icns/);
  assert.match(config, /category: public\.app-category\.developer-tools/);
  assert.match(config, /artifactName: "Pi-Agent-Desktop-\$\{version\}-mac-\$\{arch\}\.\$\{ext\}"/);
  assert.doesNotMatch(
    config,
    /^electronDist:/m,
    "a host-only electronDist prevents cross/universal packaging from downloading both architectures",
  );
});

test("Linux packaging emits a deb artifact", () => {
  assert.match(config, /linux:\n[\s\S]*?target: deb/);
  assert.match(config, /icon: build\/icon\.png/);
  assert.match(config, /category: Development/);
  assert.match(config, /executableName: pi-agent-desktop/);
  assert.match(config, /artifactName: "Pi-Agent-Desktop-\$\{version\}-linux-\$\{arch\}\.\$\{ext\}"/);
});

test("Universal merge skips lipo only for architecture-specific runtime paths", () => {
  const match = config.match(/^\s*x64ArchFiles: "([^"]+)"$/m);
  assert.ok(match, "mac.x64ArchFiles pattern expected");
  const pattern = match[1];
  for (const path of [
    "Contents/Resources/standalone/node_modules/@earendil-works/pi-tui/native/darwin/prebuilds/darwin-arm64/darwin-modifiers.node",
    "Contents/Resources/standalone/node_modules/@earendil-works/pi-tui/native/darwin/prebuilds/darwin-x64/darwin-modifiers.node",
    // pi-tui can be nested inside pi-coding-agent's node_modules instead of
    // hoisted to the top level; the glob must cover both layouts or the
    // universal merge fails with a mach-o count mismatch.
    "Contents/Resources/standalone/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/native/darwin/prebuilds/darwin-arm64/darwin-modifiers.node",
    "Contents/Resources/standalone/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/native/darwin/prebuilds/darwin-x64/darwin-modifiers.node",
    "Contents/Resources/standalone/node_modules/@mariozechner/clipboard-darwin-arm64/clipboard.darwin-arm64.node",
    "Contents/Resources/standalone/node_modules/@mariozechner/clipboard-darwin-x64/clipboard.darwin-x64.node",
    "Contents/Resources/standalone/node_modules/@img/sharp-darwin-arm64/lib/sharp.node",
    "Contents/Resources/standalone/node_modules/@img/sharp-darwin-x64/lib/sharp.node",
    "Contents/Resources/standalone/node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.dylib",
    "Contents/Resources/standalone/node_modules/@img/sharp-libvips-darwin-x64/lib/libvips.dylib",
    "Contents/Resources/standalone/.next/node_modules/@earendil-works/pi-coding-agent-4cdde81112ef3dc5/node_modules/@mariozechner/clipboard-darwin-arm64/clipboard.darwin-arm64.node",
  ]) {
    assert.ok(minimatch(path, pattern), `${path} must match x64ArchFiles`);
  }
  assert.equal(
    minimatch(
      "Contents/MacOS/Pi Agent Desktop",
      pattern,
    ),
    false,
    "the Electron executable must still be merged with lipo",
  );
});
