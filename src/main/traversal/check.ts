// src/main/traversal/check.ts  (main thread; dev-only scaffold for the __test:traversal command)
//
// LS-3 integration harness, main side. Registered only in dev builds (main.ts gates on
// import.meta.env.DEV). It piggybacks passively on page-scoped 'scan-request' messages — it never
// responds (the real registerTraversal handler owns the reply) — re-running traverse() against the
// open kitchen-sink fixture (FIX-1) and diffing the models against the golden table below, which
// derives from the LS-3 spec §3 build sheet (never hand-typed independently of it). Results stream
// to the UI as unsolicited `progress` notes ('ls3:<label>:PASS|FAIL …', terminated by 'ls3:done')
// — existing message types only, per "LS-3 adds no message types".
//
// Fixture conventions this harness relies on (input to the FIX-1 build sheet):
//   • each labelled text node's layer name equals its spec row label;
//   • a frame named 'selection-scope' wraps one subtree for the selection-scope assertion.
// On a page with none of the labels it emits a single 'ls3:fixture-missing' note and stops.
//
// Scaffolding only — never run by Vitest (no `figma` runtime); drive it from the UI's dev-only
// __test:traversal button under `npm run dev`.
import { nextMainId, on, send } from '../bridge';
import { NoSelectionError, traverse } from './index';
import type { TextNodeModel } from './model';

interface GoldenRow {
	label: string;
	expected?: Partial<TextNodeModel>;
	extra?: (model: TextNodeModel) => string[];
}

// Golden set — the traversal slice of the LS-3 spec §3 fixture table.
const golden: GoldenRow[] = [
	{
		label: 'auto-width',
		expected: {
			textAutoResize: 'WIDTH_AND_HEIGHT',
			isMixedFont: false,
			hasMissingFont: false,
			inInstance: false,
			hidden: false,
			locked: false,
		},
	},
	{ label: 'auto-height', expected: { textAutoResize: 'HEIGHT' } },
	{ label: 'fixed', expected: { textAutoResize: 'NONE' } },
	{ label: 'truncating', expected: { textTruncation: 'ENDING', maxLines: 2 } },
	{ label: 'autolayout-maxheight', expected: { maxHeight: 80 } },
	{
		label: 'mixed-font',
		expected: { isMixedFont: true },
		extra: (model) => (model.fonts.length >= 2 ? [] : [`fonts.length=${model.fonts.length} (expected >= 2)`]),
	},
	{ label: 'missing-font', expected: { hasMissingFont: true } },
	{ label: 'empty', expected: { empty: true } },
	{ label: 'nested-instance', expected: { inInstance: true } },
	{ label: 'component-override', expected: { inInstance: true, characters: 'component-override' } },
	{ label: 'in-group', expected: { parentClipsContent: false } },
	{
		label: 'zero-size',
		extra: (model) =>
			model.ownBounds === null || model.ownBounds.width === 0 || model.ownBounds.height === 0
				? []
				: [`ownBounds=${JSON.stringify(model.ownBounds)} (expected null or zero-sized)`],
	},
	{
		label: 'rotated',
		extra: (model) => {
			const failures: string[] = [];
			if (Math.abs(model.rotation - 30) > 0.01) failures.push(`rotation=${model.rotation} (expected 30)`);
			if (model.ownBounds === null) failures.push('ownBounds=null (expected the axis-aligned box)');
			return failures;
		},
	},
	{ label: 'hidden-self', expected: { hidden: true } },
	{ label: 'hidden-ancestor', expected: { hidden: true } },
	{ label: 'locked-ancestor', expected: { locked: true } },
];

function diff(model: TextNodeModel, expected: Partial<TextNodeModel>): string[] {
	const failures: string[] = [];
	for (const [key, want] of Object.entries(expected)) {
		const got = model[key as keyof TextNodeModel];
		if (got !== want) failures.push(`${key}=${String(got)} (expected ${String(want)})`);
	}
	return failures;
}

// Golden rows are keyed by layer name, which the model deliberately omits — map ids back to names.
async function labelledModels(): Promise<Map<string, TextNodeModel>> {
	const models = await traverse('page');
	const byName = new Map<string, TextNodeModel>();
	for (const model of models) {
		const node = await figma.getNodeByIdAsync(model.nodeId);
		if (node !== null && !byName.has(node.name)) byName.set(node.name, model);
	}
	return byName;
}

async function runChecks(): Promise<string[]> {
	const notes: string[] = [];
	const byName = await labelledModels();

	if (!golden.some((row) => byName.has(row.label))) {
		return ['ls3:fixture-missing (no kitchen-sink labels on this page — open fixtures/kitchen-sink.fig)'];
	}

	for (const row of golden) {
		const model = byName.get(row.label);
		if (!model) {
			notes.push(`ls3:${row.label}:FAIL missing from traversal output`);
			continue;
		}
		const failures = [...(row.expected ? diff(model, row.expected) : []), ...(row.extra ? row.extra(model) : [])];
		notes.push(failures.length === 0 ? `ls3:${row.label}:PASS` : `ls3:${row.label}:FAIL ${failures.join('; ')}`);
	}

	// Selection scope over one subtree returns exactly that subtree's text nodes. Setting the
	// selection is UI state, not a document mutation — the read-only rule is untouched.
	const scopeFrame = figma.currentPage.findOne((node) => node.name === 'selection-scope');
	if (scopeFrame === null || !('findAllWithCriteria' in scopeFrame)) {
		notes.push("ls3:selection-scope:SKIP (no container named 'selection-scope' in the fixture)");
	} else {
		figma.currentPage.selection = [scopeFrame];
		const subtree = await traverse('selection');
		const got = new Set(subtree.map((model) => model.nodeId));
		const want = new Set(scopeFrame.findAllWithCriteria({ types: ['TEXT'] }).map((node) => node.id));
		const equal = got.size === want.size && [...want].every((id) => got.has(id));
		notes.push(
			equal
				? 'ls3:selection-scope:PASS'
				: `ls3:selection-scope:FAIL got ${got.size} text nodes, expected the subtree's ${want.size}`,
		);
	}

	// Empty selection → NoSelectionError. The wire-level error mapping is asserted UI-side, which
	// relies on the selection staying cleared here.
	figma.currentPage.selection = [];
	try {
		await traverse('selection');
		notes.push('ls3:no-selection:FAIL (traverse resolved instead of throwing)');
	} catch (err) {
		notes.push(
			err instanceof NoSelectionError ? 'ls3:no-selection:PASS' : `ls3:no-selection:FAIL (${String(err)})`,
		);
	}

	return notes;
}

let running = false;

/** Registers the passive dev listener. The UI's __test:traversal button triggers it with an
 *  ordinary page-scoped scan-request; the roundtrip button's scan probe triggers it too, which is
 *  harmless (the roundtrip UI ignores progress messages with unknown ids). */
export function registerTraversalCheck(): void {
	on('scan-request', (msg) => {
		if (msg.scope !== 'page' || running) return;
		running = true;
		void runChecks()
			.catch((err: unknown) => [`ls3:error ${err instanceof Error ? err.message : String(err)}`])
			.then((notes) => {
				const all = [...notes, 'ls3:done'];
				all.forEach((note, i) =>
					send({ type: 'progress', id: nextMainId(), completed: i + 1, total: all.length, note }),
				);
			})
			.finally(() => {
				running = false;
			});
	});
}
