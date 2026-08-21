import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Loads backend/.env before any other app module reads process.env. This must
// be the FIRST import in index.ts: ES module imports are hoisted and evaluated
// before the importer's own body, so a dotenv call inside index.ts runs too
// late for modules that compute constants from env at load time (e.g.
// cloud/client.ts freezing CLOUD_URL).
const __envDir = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.resolve(__envDir, '../.env'), override: true });
