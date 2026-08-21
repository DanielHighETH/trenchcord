import { fileURLToPath } from 'url';
import path from 'path';
import { cpSync, existsSync, rmSync } from 'fs';

// Copies the built frontend into the iOS app's Resources so the embedded backend
// can serve it from disk exactly as the desktop build does (TRENCHCORD_FRONTEND_DIST).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(__dirname, '..', 'frontend', 'dist');
const target = path.join(__dirname, 'App', 'Trenchcord', 'Resources', 'frontend', 'dist');

if (!existsSync(source)) {
  console.error(
    `Frontend build not found at ${source}.\n` +
      'Run `npm run build:frontend` from the repo root first.',
  );
  process.exit(1);
}

// Wiped rather than merged: a stale asset left behind from an earlier build
// would still be served, since index.html references files by content hash.
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

console.log(`Frontend copied to ${path.relative(process.cwd(), target)}`);
