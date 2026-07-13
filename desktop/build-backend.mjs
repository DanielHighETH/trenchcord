import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundle the already-compiled backend (backend/dist) into a single ESM file so
// the packaged app doesn't need to ship node_modules. Requires `tsc` to have
// produced backend/dist first (see root `build:backend`).
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
  format: 'esm',
  target: 'node18',
  outfile: path.join(__dirname, 'dist-backend', 'index.mjs'),
  // Provide a require() shim so CJS deps that call require() at runtime work
  // inside the ESM bundle.
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  // fsevents is an optional macOS-only native dep pulled in transitively by
  // some tooling; it is not needed by the running server.
  external: ['fsevents'],
  logLevel: 'info',
});

console.log('Backend bundled to dist-backend/index.mjs');
