import assert from "node:assert/strict";
import test from "node:test";
import {
  requiredDarwinSharpPackages,
  resolveMacArch,
} from "./ensure-standalone-macos-runtimes.mjs";

test("resolves the MAC_ARCH packaging target", () => {
  assert.equal(resolveMacArch(undefined, "arm64"), "arm64");
  assert.equal(resolveMacArch("", "arm64"), "arm64");
  assert.equal(resolveMacArch("host", "x64"), "x64");
  assert.equal(resolveMacArch("x64", "arm64"), "x64");
  assert.equal(resolveMacArch("arm64", "x64"), "arm64");
  assert.equal(resolveMacArch("universal", "arm64"), "universal");
  assert.throws(
    () => resolveMacArch("universal-apple-darwin", "arm64"),
    /MAC_ARCH must be one of/,
  );
  assert.throws(
    () => resolveMacArch("host", "ia32"),
    /not a supported macOS target/,
  );
});

test("single-arch targets keep only the matching Sharp pair", () => {
  const optionalDependencies = {
    "@img/sharp-linux-x64": "0.35.3",
    "@img/sharp-libvips-darwin-x64": "1.3.2",
    "@img/sharp-darwin-arm64": "0.35.3",
    "@img/sharp-darwin-x64": "0.35.3",
    "@img/sharp-libvips-darwin-arm64": "1.3.2",
  };

  assert.deepEqual(requiredDarwinSharpPackages({ optionalDependencies }, "arm64"), [
    { name: "@img/sharp-darwin-arm64", version: "0.35.3" },
    { name: "@img/sharp-libvips-darwin-arm64", version: "1.3.2" },
  ]);

  assert.deepEqual(requiredDarwinSharpPackages({ optionalDependencies }, "x64"), [
    { name: "@img/sharp-darwin-x64", version: "0.35.3" },
    { name: "@img/sharp-libvips-darwin-x64", version: "1.3.2" },
  ]);
});

test("universal targets select both macOS architectures from Sharp optional dependencies", () => {
  const packages = requiredDarwinSharpPackages({
    optionalDependencies: {
      "@img/sharp-linux-x64": "0.35.3",
      "@img/sharp-libvips-darwin-x64": "1.3.2",
      "@img/sharp-darwin-arm64": "0.35.3",
      "@img/sharp-darwin-x64": "0.35.3",
      "@img/sharp-libvips-darwin-arm64": "1.3.2",
    },
  }, "universal");

  assert.deepEqual(packages, [
    { name: "@img/sharp-darwin-arm64", version: "0.35.3" },
    { name: "@img/sharp-darwin-x64", version: "0.35.3" },
    { name: "@img/sharp-libvips-darwin-arm64", version: "1.3.2" },
    { name: "@img/sharp-libvips-darwin-x64", version: "1.3.2" },
  ]);
});

test("fails closed when Sharp's macOS optional dependency set changes", () => {
  assert.throws(
    () =>
      requiredDarwinSharpPackages(
        { optionalDependencies: { "@img/sharp-darwin-arm64": "0.35.3" } },
        "universal",
      ),
    /expected Sharp optional dependencies/,
  );
  assert.throws(
    () =>
      requiredDarwinSharpPackages(
        { optionalDependencies: { "@img/sharp-darwin-arm64": "0.35.3" } },
        "x64",
      ),
    /expected Sharp optional dependencies/,
  );
});
