// Fails when dev-only scaffolding reaches the production bundle.
//
// The LS-2 transport round-trip scaffold (src/main/roundtrip.ts, src/ui/roundtrip.ts) and the
// canonical message fixtures it replays (src/common/messages.fixtures.ts) are dev tools. They escaped
// into dist/main.js once — registerRoundtrip() sat outside main.ts's DEV block — and nothing noticed:
// no test renders the production bundle, and the scaffold is silent until a real handler for one of
// its message types lands beside it. This asserts on the built output itself, which is the only
// place that bug class is visible.
//
// Markers are the fixture ids, read from the fixtures source so a renamed or added fixture is
// covered automatically, plus the literal `roundtrip` (the harness's console prefixes and dev
// button label). Minification strips identifiers, so function names are not usable markers.
//
// Runs as `postbuild`, so `npm run build` fails on a leak. Standalone: `npm run check:dist` after a
// production build — NOT after `npm run dev`, whose dist/ legitimately contains all of this.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLES = ['dist/main.js', 'dist/ui.html'];

function read(relative) {
	try {
		return readFileSync(join(repoRoot, relative), 'utf8');
	} catch {
		console.error(`check:dist — FAIL: ${relative} is missing. Run \`npm run build\` first.`);
		process.exit(1);
	}
}

const fixtureIds = [...read('src/common/messages.fixtures.ts').matchAll(/\bid: '(fx-[a-z-]+)'/g)].map(
	(match) => match[1],
);
if (fixtureIds.length === 0) {
	// A marker list that silently matches nothing passes identically to one that works.
	console.error('check:dist — FAIL: no fixture ids found in src/common/messages.fixtures.ts; update the pattern.');
	process.exit(1);
}
const markers = ['roundtrip', ...fixtureIds];

let leaks = 0;
for (const bundle of BUNDLES) {
	const content = read(bundle);
	const found = markers.filter((marker) => content.includes(marker));
	if (found.length > 0) {
		leaks += found.length;
		console.error(`check:dist — FAIL: ${bundle} contains dev-only markers: ${found.join(', ')}`);
	}
}

if (leaks > 0) {
	console.error('Dev scaffolding reached the production bundle — gate it behind `import.meta.env.DEV`.');
	process.exit(1);
}
console.log(`check:dist — OK: ${markers.length} markers absent from ${BUNDLES.join(' and ')}.`);
