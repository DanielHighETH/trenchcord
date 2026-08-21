import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'App', 'Trenchcord', 'Resources', 'backend');
const OUT_FILE = path.join(OUT_DIR, 'index.cjs');

// Bundle the compiled backend into a single file for nodejs-mobile, which runs
// it straight off the app bundle with no node_modules to resolve against.
//
// CJS rather than the desktop build's ESM: nodejs-mobile starts its entry script
// through node's CommonJS loader, and an .mjs entry there is fragile. The cost is
// that `import.meta.url` — which the backend uses to locate its data directory —
// has no CJS equivalent, so it is compiled to a __filename-derived file URL below.
const entry = path.join(__dirname, '..', 'backend', 'dist', 'index.js');
if (!existsSync(entry)) {
  console.error(
    `Backend build not found at ${entry}.\n` +
      'Run `npm run build:backend` from the repo root first.',
  );
  process.exit(1);
}

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18', // nodejs-mobile v18.20.4 ships a Node 18.20.4 runtime
  outfile: OUT_FILE,
  define: {
    'import.meta.url': '__importMetaUrl',
  },
  banner: {
    js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;",
  },
  external: [
    // Optional macOS-only native dep pulled in transitively by some tooling;
    // not needed by the running server (and could not load on iOS anyway).
    'fsevents',
    // undici parses HTTP with a WebAssembly module, which nodejs-mobile cannot
    // run. discord/proxy.ts already imports it lazily so it is never touched on
    // iOS, but a lazy import is still *bundled* — keeping it external is what
    // actually keeps the WASM out of the payload. The only code path that would
    // resolve it is an HTTP proxy for Discord, which iOS does not support; there
    // it throws MODULE_NOT_FOUND, caught by the callers' existing error handling.
    'undici',
  ],
  logLevel: 'info',
});

// nodejs-mobile runs V8 with JIT disabled, which also disables WebAssembly. Any
// dependency that instantiates a WASM module dies at runtime with a bare
// "WebAssembly is not defined" — a long way from the code that pulled it in. The
// known offender is undici (its HTTP parser is WASM), which is why the backend
// routes outbound HTTP through utils/http.ts and loads undici lazily, only on the
// proxy path that iOS does not use. This check exists so a *new* dependency
// reintroducing WASM fails the build instead of the app.
const bundled = readFileSync(OUT_FILE, 'utf-8');
const wasmHits = [...bundled.matchAll(/WebAssembly\.\w+/g)].map((m) => m[0]);
if (wasmHits.length > 0) {
  const unique = [...new Set(wasmHits)];
  console.error(
    `\nERROR: the iOS bundle references WebAssembly (${unique.join(', ')}).\n` +
      'nodejs-mobile has no WebAssembly, so this will crash on device.\n' +
      'Find the dependency that pulled it in and load it lazily (see discord/proxy.ts)\n' +
      'or replace it. Bundle written anyway for inspection: ' + OUT_FILE,
  );
  process.exit(1);
}

// nodejs-mobile's V8 is built without full ICU, so \p{...}/\P{...} Unicode
// property escapes are invalid regex syntax there. In a regex LITERAL that is an
// early SyntaxError thrown while the module compiles — it kills the entire
// bundle at load, and try/catch cannot contain it. Only new RegExp(string) is
// safe (compiled at runtime, catchable, with a fallback — see
// MEANINGFUL_LABEL_RE in backend/src/telegram/client.ts). A literal `/\p{...}/`
// survives into the bundle with a single backslash; the string form is escaped
// as `\\p{`, which is what the negative lookbehind skips.
const propEscapeHits = [...bundled.matchAll(/(?<!\\)\\[pP]\{\w+/g)].map((m) => m[0]);
if (propEscapeHits.length > 0) {
  const unique = [...new Set(propEscapeHits)];
  console.error(
    `\nERROR: the iOS bundle contains regex-literal Unicode property escapes (${unique.join(', ')}).\n` +
      'nodejs-mobile has no full ICU, so compiling the module throws an early\n' +
      'SyntaxError and the whole app dies at load. Rewrite the regex as\n' +
      'new RegExp(string) with a non-\\p fallback (see MEANINGFUL_LABEL_RE in\n' +
      'backend/src/telegram/client.ts).\n' +
      'Bundle written anyway for inspection: ' + OUT_FILE,
  );
  process.exit(1);
}

const sizeMb = (statSync(OUT_FILE).size / 1024 / 1024).toFixed(1);
console.log(`Backend bundled to ${path.relative(process.cwd(), OUT_FILE)} (${sizeMb} MB, no WebAssembly, no \\p{} regex literals)`);
