// Pre-publish guard (LS-13 D6): fails while the Pro waitlist URL is still the `example.invalid`
// placeholder, so a Community release can never ship four stubs that open a dead link.
//
// Release-only on purpose: NOT part of `build`, `postbuild` or CI, because every build before the
// waitlist exists legitimately carries the placeholder. Run it by hand as the last step before
// publishing: `npm run check:release`.
//
// Like check-dist.mjs, it asserts on the built artifact — the only place a stale constant is
// visible — and reads the placeholder host from src/common/pro.ts, so the two can never drift.
//
// Usage: `node scripts/check-release.mjs` builds first. `--no-build [distDir]` checks an existing
// dist (used to prove the guard passes on a clean bundle).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const noBuild = args[0] === '--no-build';
const dist = noBuild && args[1] !== undefined ? args[1] : join(root, 'dist');

const proSource = readFileSync(join(root, 'src/common/pro.ts'), 'utf8');
const match = /WAITLIST_PLACEHOLDER_HOST = '([^']+)'/.exec(proSource);
if (match === null) {
	console.error('check:release — FAIL: WAITLIST_PLACEHOLDER_HOST not found in src/common/pro.ts.');
	process.exit(1);
}
const host = match[1];

if (!noBuild) execSync('npm run build', { cwd: root, stdio: 'inherit' });

const leaks = ['main.js', 'ui.html'].filter((file) => readFileSync(join(dist, file), 'utf8').includes(host));
if (leaks.length > 0) {
	for (const file of leaks) {
		console.error(
			`check:release — FAIL: dist/${file} still links the placeholder waitlist (${host}). Set WAITLIST_URL in src/common/pro.ts.`,
		);
	}
	process.exit(1);
}
console.log('check:release — OK: no placeholder waitlist URL in dist/main.js or dist/ui.html.');
