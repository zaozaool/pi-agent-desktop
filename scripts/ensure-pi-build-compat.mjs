/**
 * Build-time compatibility patches for pi-coding-agent 0.99.x under Next.js
 * Turbopack (`next build` inside build:standalone).
 *
 * pi 0.99 added codemode (QuickJS WASM) with two constructs that Turbopack's
 * static analysis cannot handle, even though the package is listed in
 * serverExternalPackages (Next still runs an externals-tracing pass over it):
 *
 * 1. dist/config.js references `new URL("./codemode-worker.js", import.meta.url)`
 *    and `new URL("./src/extensions/codemode/worker.js", import.meta.url)`.
 *    Those files only exist in upstream's Bun/bundled builds and are NOT
 *    published to npm, so Turbopack fails with "Module not found".
 *    At runtime on plain Node both branches are dead (isBundledNode /
 *    isBunBinary are false, getCodemodeWorkerUrl() returns undefined and
 *    pi-codemode falls back to its own worker), so empty stub files are inert.
 *
 * 2. dist/bun/runtime-setup.js does `import quickjsWasmPath from
 *    "quickjs-wasi/quickjs.wasm"` (Bun-only entry). Turbopack compiles the
 *    .wasm into a `*.wasm_.loader.mjs` whose pseudo-imports ("env",
 *    "wasi_snapshot_preview1") cannot be resolved. We rewrite the static
 *    import into a guarded createRequire resolve, which behaves identically
 *    under Bun and is never executed under Node.
 *
 * 3. dist/config.js getQuickJSWasmPath() calls
 *    `createRequire(import.meta.url).resolve("quickjs-wasi/quickjs.wasm")`.
 *    Turbopack statically analyzes that exact call chain and pulls the .wasm
 *    into the graph (same broken loader as #2). The module ends up compiled
 *    because lib/session-export.ts imports pi's dist/core/export-html via a
 *    relative path into node_modules, bypassing serverExternalPackages.
 *    Rebuilding the specifier dynamically defeats the static analysis while
 *    resolving identically at runtime.
 *
 * All patches are idempotent. Runs before `next build` in build:standalone.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const piRoot = join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent");

function ensureStubFile(relPath) {
  const target = join(piRoot, relPath);
  if (existsSync(target)) return false;
  mkdirSync(dirname(target), { recursive: true });
  // Inert placeholder: only referenced via new URL() in branches that are dead
  // on Node (isBundledNode / isBunBinary). Never imported or executed.
  writeFileSync(target, "// Build-compat stub (see scripts/ensure-pi-build-compat.mjs)\nexport {};\n");
  return true;
}

function patchBunRuntimeSetup() {
  const target = join(piRoot, "dist", "bun", "runtime-setup.js");
  if (!existsSync(target)) return false;
  const src = readFileSync(target, "utf8");
  const needle = 'import quickjsWasmPath from "quickjs-wasi/quickjs.wasm";';
  if (!src.includes(needle)) return false; // already patched or upstream changed
  const replacement = [
    "// Build-compat patch (scripts/ensure-pi-build-compat.mjs): the static wasm import",
    "// makes Turbopack emit an unresolvable quickjs.wasm_.loader.mjs. Resolve at runtime instead.",
    "import { createRequire as __cr } from \"node:module\";",
    "let quickjsWasmPath;",
    "try { quickjsWasmPath = __cr(import.meta.url).resolve(\"quickjs-wasi/quickjs.wasm\"); } catch { quickjsWasmPath = \"\"; }",
  ].join("\n");
  writeFileSync(target, src.replace(needle, replacement));
  return true;
}

function patchConfigQuickJSWasmPath() {
  const target = join(piRoot, "dist", "config.js");
  if (!existsSync(target)) return false;
  const src = readFileSync(target, "utf8");
  const needle =
    'return embeddedQuickJSWasmPath ?? createRequire(import.meta.url).resolve("quickjs-wasi/quickjs.wasm");';
  if (!src.includes(needle)) return false; // already patched or upstream changed
  const replacement = [
    "// Build-compat patch (scripts/ensure-pi-build-compat.mjs): Turbopack statically",
    "// analyzes `createRequire(import.meta.url).resolve(<literal>)` and would pull",
    "// quickjs.wasm into the bundle as an unresolvable loader. A dynamic specifier",
    "// resolves identically at runtime but is invisible to static analysis.",
    'const __quickjsWasmSpecifier = ["quickjs-wasi", "quickjs.wasm"].join("/");',
    "return embeddedQuickJSWasmPath ?? createRequire(import.meta.url).resolve(__quickjsWasmSpecifier);",
  ].join("\n");
  writeFileSync(target, src.replace(needle, replacement));
  return true;
}

const created = [
  ensureStubFile(join("dist", "codemode-worker.js")),
  ensureStubFile(join("dist", "src", "extensions", "codemode", "worker.js")),
];
const patched = patchBunRuntimeSetup();
const patchedConfig = patchConfigQuickJSWasmPath();

if (created.some(Boolean) || patched || patchedConfig) {
  console.log("[ensure-pi-build-compat] patched pi-coding-agent for Turbopack:", {
    stubs: created.filter(Boolean).length,
    bunRuntimeSetup: patched,
    configQuickJSWasmPath: patchedConfig,
  });
}
