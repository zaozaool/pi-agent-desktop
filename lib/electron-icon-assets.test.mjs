import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const builderConfig = readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8");

test("native Windows and macOS app icons are included in the Electron runtime package", () => {
  assert.match(builderConfig, /-\s+build\/icon\.ico/);
  assert.match(builderConfig, /-\s+build\/icon\.icns/);
  assert.doesNotMatch(builderConfig, /-\s+build\/tray-icon\.ico/);
  assert.ok(statSync(new URL("../build/icon.ico", import.meta.url)).size > 10_000);
  const macIcon = readFileSync(new URL("../build/icon.icns", import.meta.url));
  assert.equal(macIcon.subarray(0, 4).toString("ascii"), "icns");
  // Must be a real multi-representation icon (header + several size chunks),
  // not a stray 1KB placeholder. Our artwork is flat so the PNG reps
  // compress well (~76KB for the full 16-1024px set).
  assert.ok(macIcon.length > 50_000);
  assert.ok(macIcon.includes(Buffer.from("ic10")), "missing 1024px (ic10) representation");
  assert.ok(macIcon.includes(Buffer.from("ic07")), "missing 128px (ic07) representation");
});
