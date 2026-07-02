import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Dependencies that were added/changed recently and are easy to miss if you
// pulled new code but forgot to re-run `npm install`. `teleproto` replaced the
// old `telegram` package, so upgraders will have it missing from node_modules.
const REQUIRED_PACKAGES = ['teleproto'];

function findMissingPackages(): string[] {
  return REQUIRED_PACKAGES.filter((pkg) => {
    try {
      require.resolve(`${pkg}/package.json`);
      return false;
    } catch {
      try {
        require.resolve(pkg);
        return false;
      } catch {
        return true;
      }
    }
  });
}

function printMissingDepsBanner(missing: string[]): void {
  const line = '═'.repeat(64);
  const banner = [
    '',
    line,
    '  Trenchcord can\'t start — missing dependencies',
    line,
    '',
    `  Not installed:  ${missing.join(', ')}`,
    '',
    '  This usually means new packages were added since your last pull',
    '  (Telegram now uses "teleproto" instead of "telegram").',
    '',
    '  Fix it by reinstalling dependencies from the project root:',
    '',
    '      npm install',
    '',
    '  Then start Trenchcord again (npm start, or npm run dev).',
    line,
    '',
  ].join('\n');
  console.error(banner);
}

const missing = findMissingPackages();
if (missing.length > 0) {
  printMissingDepsBanner(missing);
  process.exit(1);
}

// Defer loading the real app until after the preflight check. Static imports at
// the top of index.ts would otherwise resolve `teleproto` before this runs and
// throw a cryptic ERR_MODULE_NOT_FOUND instead of the friendly banner above.
await import('./index.js');
