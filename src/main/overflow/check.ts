// src/main/overflow/check.ts  (main thread; dev-only scaffold for the LS-8 overflow check)
//
// LS-8 acceptance harness, main side (spec §3 pass 1 + the pass-3 selection assertion). Registered
// only in dev builds (main.ts gates on import.meta.env.DEV). It piggybacks passively on page-scoped
// 'overflow-scan-request' messages — it never responds (the real registerOverflow handler owns the
// reply) — measuring each labelled fixture row with an EXPLICIT candidate, bypassing expansion, so
// a wrong ratio cannot masquerade as a wrong rule. Results stream to the UI as unsolicited
// `progress` notes ('ls8:<label>:PASS|FAIL …', terminated by 'ls8:done'), relayed to the console by
// src/ui/overflow-check.ts. Requests naming an unsupported language are ignored: the driver's ja
// refusal probe must not re-run pass 1.
//
// Pass 3 (LS-8.2 §3.2) adds the magnitude assertions to the same walk: field presence and sign on
// every row, `maxHeight-cap` asserted to carry NO delta, and — for fixed-box rows — an independent
// constrained re-read that must agree with the engine's own. The observed deltas are printed and go
// in the PR description as the first-run baseline.
//
// It also piggybacks 'select-node' (pass 4): after the real handler runs in the same dispatch, a
// bounded poll asserts the selection landed on the target. The fabricated-id case asserts nothing
// here (the node-gone error surfacing is the UI driver's assertion).
//
// Scaffolding only — never run by Vitest (no `figma` runtime); drive it from the UI's dev-only
// "Run LS-8 overflow check" button under `npm run dev` with fixtures/overflow-spike.fig open.
import type { OverflowReason, OverflowVerdictValue } from '../../common/models';
import { nextMainId, on, send } from '../bridge';
import { traverse } from '../traversal';
import type { TextNodeModel } from '../traversal/model';
import { isUnsupportedLanguage } from './expand';
import { measureOverflow, type Measurement } from './measure';

const SHORT = 'OK';
// The 160-character sentence carried over from the LS-7 spike harness.
const LONG =
	'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly over it again and again, and then the fox jumps over the lazy dog once more.';

interface CheckRow {
	label: string;
	candidate: string;
	/** 'measurable' = any verdict except unmeasurable (reason unchecked). */
	expected: OverflowVerdictValue | 'measurable';
	/** Expected reason; undefined = reason must be absent. */
	reason?: OverflowReason;
}

// The LS-8 spec §3 pass-1 table — verdict AND reason are asserted.
const rows: CheckRow[] = [
	{ label: 'fixed-fits', candidate: SHORT, expected: 'fits' },
	{ label: 'fixed-overflows', candidate: LONG, expected: 'overflows', reason: 'exceeds-fixed-box' },
	{ label: 'truncate-fits', candidate: SHORT, expected: 'fits' },
	{ label: 'truncate-overflows', candidate: LONG, expected: 'truncates', reason: 'truncated-fixed-box' },
	{ label: 'autoheight-fits', candidate: SHORT, expected: 'fits' },
	{ label: 'autoheight-overflows', candidate: LONG, expected: 'overflows', reason: 'exceeds-container-height' },
	{ label: 'autoheight-maxlines', candidate: LONG, expected: 'truncates', reason: 'maxLines-cap' },
	{ label: 'autoheight-maxheight', candidate: LONG, expected: 'truncates', reason: 'maxHeight-cap' },
	{ label: 'hug-fits', candidate: SHORT, expected: 'fits' },
	{ label: 'hug-overflows', candidate: LONG, expected: 'overflows', reason: 'parent-escape' },
	{ label: 'hug-page-parent', candidate: LONG, expected: 'fits', reason: 'no-container' },
	{ label: 'missing-font', candidate: SHORT, expected: 'unmeasurable', reason: 'missing-font' },
	{ label: 'mixed-font-ok', candidate: SHORT, expected: 'measurable' },
	{ label: 'rotated-fixed', candidate: LONG, expected: 'overflows', reason: 'exceeds-fixed-box' },
];

// Golden rows are keyed by layer name, which the model deliberately omits — map ids back to names.
// First-wins also shields the map from any in-flight measurement clones (a clone shares its
// original's name but appends at the page end, so document order puts the original first).
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

	if (!rows.some((row) => byName.has(row.label))) {
		return ['ls8:fixture-missing (no overflow-spike labels on this page — open fixtures/overflow-spike.fig)'];
	}

	for (const row of rows) {
		const model = byName.get(row.label);
		if (!model) {
			notes.push(`ls8:${row.label}:FAIL missing from traversal output`);
			continue;
		}
		const node = await figma.getNodeByIdAsync(model.nodeId);
		if (node === null || node.type !== 'TEXT') {
			notes.push(`ls8:${row.label}:FAIL node vanished between scan and measure`);
			continue;
		}
		try {
			const measurement = (await measureOverflow({ node, model, candidates: [row.candidate] }))[0];
			if (measurement === undefined) {
				notes.push(`ls8:${row.label}:FAIL measureOverflow returned no measurement`);
				continue;
			}
			const verdictOk =
				row.expected === 'measurable'
					? measurement.verdict !== 'unmeasurable'
					: measurement.verdict === row.expected;
			const reasonOk = row.expected === 'measurable' || measurement.reason === row.reason;
			notes.push(
				verdictOk && reasonOk
					? `ls8:${row.label}:PASS`
					: `ls8:${row.label}:FAIL verdict=${measurement.verdict} (expected ${row.expected}), ` +
							`reason=${measurement.reason ?? 'none'} (expected ${row.reason ?? 'none'}), ` +
							`measured=${measurement.measuredWidth.toFixed(1)}×${measurement.measuredHeight.toFixed(1)}`,
			);
			await checkMagnitude(row, node, model, measurement, notes);
		} catch (err) {
			notes.push(`ls8:${row.label}:FAIL measureOverflow threw: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	return notes;
}

/**
 * Independent re-derivation of `overflowPx` for fixed-box rows (LS-8.2 §3.2).
 *
 * The engine's second read is verified against a second, separately written constrained read of the
 * same node — never against a hand-typed constant. A wrong golden and a wrong implementation can
 * agree and both pass (agent-guidelines §6), and these numbers could not be hand-typed anyway: they
 * depend on the metrics of whatever Inter build the machine has.
 *
 * Growing-mode rows are not re-derived: their deltas are plain subtractions of numbers the
 * measurement already returns, with no second read to get wrong. Their observed value is printed
 * instead — that print is the first-run baseline the PR description records.
 */
async function checkMagnitude(
	row: CheckRow,
	node: TextNode,
	model: TextNodeModel,
	measurement: Measurement,
	notes: string[],
): Promise<void> {
	const px = measurement.overflowPx;

	// Field-presence rules, on every row regardless of mode.
	if (measurement.verdict === 'fits' || measurement.verdict === 'unmeasurable') {
		if (px !== undefined) notes.push(`ls8:${row.label}-px:FAIL ${measurement.verdict} row carries overflowPx=${px}`);
		return;
	}
	if (measurement.reason === 'maxHeight-cap') {
		// The hidden amount is not knowable: the clone inherits the cap, and clearing it off
		// auto-layout is silently rejected (LS-8.2 §2.1).
		notes.push(
			px === undefined
				? `ls8:${row.label}-px:PASS maxHeight-cap carries no delta, as specified`
				: `ls8:${row.label}-px:FAIL maxHeight-cap must not carry a delta (got ${px})`,
		);
		return;
	}
	if (px === undefined) {
		notes.push(`ls8:${row.label}-px:FAIL ${measurement.verdict} row carries no overflowPx`);
		return;
	}
	if (!(px > 0)) {
		notes.push(`ls8:${row.label}-px:FAIL overflowPx=${px} is not > 0`);
		return;
	}

	const mode = model.textAutoResize;
	if (mode !== 'NONE' && mode !== 'TRUNCATE') {
		notes.push(`ls8:${row.label}-px:PASS ${px.toFixed(2)}px`);
		return;
	}

	// Fixed box: re-derive from our own constrained read, on our own clone.
	const clone = node.clone();
	try {
		figma.currentPage.appendChild(clone);
		clone.x = -20000;
		clone.y = -20000;
		for (const font of clone.getRangeAllFontNames(0, clone.characters.length)) {
			await figma.loadFontAsync(font);
		}
		clone.textAutoResize = 'HEIGHT';
		clone.resize(node.width, clone.height);
		clone.textTruncation = 'DISABLED';
		clone.characters = row.candidate;
		const expected = Math.max(clone.width - node.width, clone.height - node.height);
		const agrees = Math.abs(expected - px) <= 0.01;
		notes.push(
			agrees
				? `ls8:${row.label}-px:PASS ${px.toFixed(2)}px (re-derived ${expected.toFixed(2)})`
				: `ls8:${row.label}-px:FAIL overflowPx=${px.toFixed(2)} but re-derived ${expected.toFixed(2)}`,
		);
	} finally {
		clone.remove();
	}
}

let running = false;

/** Registers the passive dev listeners. The UI's "Run LS-8 overflow check" button triggers pass 1
 *  with its ordinary de-scan request; the roundtrip button's overflow probe triggers it too, which
 *  is harmless (the roundtrip UI ignores progress messages with unknown ids). */
export function registerOverflowCheck(): void {
	on('overflow-scan-request', (msg) => {
		if (msg.scope !== 'page' || msg.targetLanguages.some(isUnsupportedLanguage) || running) return;
		running = true;
		void runChecks()
			.catch((err: unknown) => [`ls8:error ${err instanceof Error ? err.message : String(err)}`])
			.then((notes) => {
				const all = [...notes, 'ls8:done'];
				all.forEach((note, i) =>
					send({ type: 'progress', id: nextMainId(), completed: i + 1, total: all.length, note }),
				);
			})
			.finally(() => {
				running = false;
			});
	});

	on('select-node', (msg) => {
		void (async () => {
			const note = (text: string): void => {
				send({ type: 'progress', id: nextMainId(), completed: 1, total: 1, note: text });
			};
			const target = await figma.getNodeByIdAsync(msg.nodeId);
			if (target === null || target.type !== 'TEXT') {
				// The real handler must answer this with a node-gone error — asserted UI-side.
				note('ls8:select-node-info:expect-node-gone');
				return;
			}
			// The real handler's async work runs in the same dispatch — poll briefly for the
			// selection to land rather than racing it.
			for (let attempt = 0; attempt < 20; attempt++) {
				const selection = figma.currentPage.selection;
				if (selection.length === 1 && selection[0]?.id === target.id) {
					note('ls8:select-node:PASS');
					return;
				}
				await new Promise<void>((resolve) => setTimeout(resolve, 100));
			}
			note(`ls8:select-node:FAIL selection never landed on ${target.id}`);
		})();
	});
}
