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
//
// Second, unrelated bug class, same rationale (assert on the built artifact, because that is the
// only place it is visible): dist/main.js must be emitted at ES2017. Figma's plugin VM is QuickJS
// compiled to wasm. Bounds are in docs/agent-guidelines.md §1 — the floor is measured, the ceiling
// is precautionary.
//
//   Ceiling — nothing above ES2017 has been observed failing in Figma; ES2017 is simply the lowest
//   target known to work. Parsed here with acorn at `ecmaVersion: 2017`. A regex for `?.` and `??`
//   was the obvious alternative and is the wrong tool: it has false positives inside string
//   literals and misses every construct nobody thought to list.
//
//   Floor — below ES2017 there is no native async/await, so esbuild downlevels every async
//   function into a generator plus a Promise driver. The VM rejects that output at bytecode
//   compilation with `InternalError: stack underflow (op=113, pc=263)`, and because the whole script
//   fails to compile, no line of plugin code executes — a `console.log` on line 1 of main.ts does not
//   print. This is the failure that shipped on main: Plugma's built-in target for the main context
//   is `es6`, which produced 13 `function*` bodies. Note that the acorn parse CANNOT catch this —
//   generators are ES2015 and parse clean at 2017 — so the generator walk below is the check that
//   actually covers it. Do not remove it as redundant. It is a proxy — whether QuickJS chokes on the
//   generators or on the driver around them is not established, and a hand-written `function*`
//   would trip it too — so its message names the likely cause, not "generators are banned".
//
// Both bounds are set by `build.target` in vite.config.ts. Only dist/main.js is checked: dist/ui.html
// runs in a real browser iframe where modern syntax is fine.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as acorn from 'acorn';

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
} else {
	console.log(`check:dist — OK: ${markers.length} markers absent from ${BUNDLES.join(' and ')}.`);
}

// --- Main-bundle syntax: ES2017 exactly (see header) --------------------------------------------

const MAIN_BUNDLE = 'dist/main.js';
const ECMA_VERSION = 2017;
let syntaxFailures = 0;
const mainSource = read(MAIN_BUNDLE);

let mainAst = null;
try {
	mainAst = acorn.parse(mainSource, { ecmaVersion: ECMA_VERSION, sourceType: 'script', locations: true });
} catch (error) {
	syntaxFailures += 1;
	const at = error.loc ? `line ${error.loc.line}, column ${error.loc.column}` : 'unknown position';
	console.error(`check:dist — FAIL: ${MAIN_BUNDLE} is not valid ES${ECMA_VERSION} at ${at}: ${error.message}`);
	console.error(`This usually means \`build.target\` for the main context was raised above es${ECMA_VERSION}.`);
	console.error('The cap is precautionary, not measured — see docs/agent-guidelines.md §1 before raising it.');
}

// Walks every child node generically, so it cannot miss a function position nobody enumerated.
function walk(node, visit) {
	if (node === null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit);
		return;
	}
	if (typeof node.type === 'string') visit(node);
	for (const key of Object.keys(node)) {
		if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
		walk(node[key], visit);
	}
}

if (mainAst) {
	const generators = [];
	walk(mainAst, (node) => {
		if (node.generator === true) generators.push(node);
	});
	if (generators.length > 0) {
		syntaxFailures += 1;
		const first = generators[0].loc?.start;
		const at = first ? `line ${first.line}, column ${first.column}` : 'unknown position';
		console.error(
			`check:dist — FAIL: ${generators.length} generator function(s) in ${MAIN_BUNDLE}, first at ${at}.`,
		);
		console.error(
			`This usually means \`build.target\` for the main context regressed below es${ECMA_VERSION}; see docs/agent-guidelines.md §1.`,
		);
	} else {
		console.log(`check:dist — OK: ${MAIN_BUNDLE} is valid ES${ECMA_VERSION} and generator-free.`);
	}
}

if (leaks > 0 || syntaxFailures > 0) {
	process.exit(1);
}
