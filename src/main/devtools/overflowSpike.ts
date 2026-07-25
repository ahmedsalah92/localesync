// src/main/devtools/overflowSpike.ts
// LS-7 spike harness — THROWAWAY per docs/specs/LS-7.md §3: dev-gated scaffolding, never production
// code, and NOT the LS-8 implementation. Prototype of the §2 clone measurement protocol (Approach A:
// off-canvas temp-node clone) plus the runner behind the UI's dev-only "Run LS-7 overflow spike"
// button. Run against fixtures/overflow-spike.fig: logs verdict-vs-expected per labelled node, the
// §3 maxLines live-verification observations, and clone-fidelity probes — raw material for the
// decision-doc run record (LS-7.md §6). Main thread only; wired behind import.meta.env.DEV in
// main.ts via the __dev: sentinel channel. Never mutates a user node — measurement touches clones
// exclusively, and clones are removed in try/finally.

import { traverse } from '../traversal';
import type { TextNodeModel } from '../traversal/model';

// ── Spike contracts (LS-7.md §1; LS-8 moves these to src/main/overflow/) ─────
type MeasurementVerdict = 'fits' | 'overflows' | 'truncates' | 'unmeasurable';

interface MeasurementInput {
	node: TextNode; // live node ref (re-fetched via getNodeByIdAsync)
	model: TextNodeModel; // LS-3 model (pre-scanned, provides bounds + flags)
	candidateText: string; // the translated string to measure against
}

interface MeasurementResult {
	nodeId: string;
	verdict: MeasurementVerdict;
	reason?: string; // explanation when unmeasurable or truncates
	measuredWidth: number; // content width with candidate text (from clone); 0 when unmeasurable
	measuredHeight: number; // content height with candidate text (from clone); 0 when unmeasurable
	// Spike-only instrumentation, NOT part of the LS-8 signature: capped-vs-free heights for the
	// maxLines/maxHeight detection protocol, clone-inheritance and bounds-sync fidelity probes.
	debug: string[];
}

// Float comparisons: Figma stores float32 (dimensions floored at 0.01 — agent-guidelines §2).
const EPS = 0.01;

function readBounds(clone: TextNode, rotation: number, debug: string[]): { width: number; height: number } {
	const box = clone.absoluteBoundingBox;
	if (box === null) {
		debug.push('absoluteBoundingBox=null on clone — fell back to width/height');
		return { width: clone.width, height: clone.height };
	}
	// Fidelity probe (LS-7.md §4): on an unrotated node the AABB must agree with width/height right
	// after the characters write — a mismatch means absoluteBoundingBox is not updating
	// synchronously, a finding to pin in agent-guidelines §2.
	if (rotation === 0 && (Math.abs(box.width - clone.width) > EPS || Math.abs(box.height - clone.height) > EPS)) {
		debug.push(
			`bounds-sync gap: AABB ${box.width.toFixed(2)}×${box.height.toFixed(2)} ≠ ` +
				`node ${clone.width.toFixed(2)}×${clone.height.toFixed(2)} after characters write`,
		);
	}
	return { width: box.width, height: box.height };
}

/** Prototype of the LS-7 §2 clone measurement protocol. Creates an off-canvas clone, sets candidate
 *  text, reads resulting bounds, applies the per-mode overflow rule. Never mutates the user's node;
 *  deletes the clone before returning (try/finally). */
async function measureOverflow(input: MeasurementInput): Promise<MeasurementResult> {
	const { node, model, candidateText } = input;
	const debug: string[] = [];
	const unmeasurable = (reason: string): MeasurementResult => ({
		nodeId: model.nodeId,
		verdict: 'unmeasurable',
		reason,
		measuredWidth: 0,
		measuredHeight: 0,
		debug,
	});

	// §2 missing/mixed-font + empty table — resolved from the model before any clone exists.
	if (model.empty) return unmeasurable('empty');
	if (model.hasMissingFont) return unmeasurable(model.isMixedFont ? 'mixed-font-missing' : 'missing-font');
	const ownBounds = model.ownBounds;
	if (ownBounds === null) return unmeasurable('no-bounds');

	const clone = node.clone();
	try {
		// Belt-and-suspenders re-check on the live clone BEFORE any write (stricter than the §2 step
		// order): a font may have gone missing since the scan, and a missing-font node must never be
		// mutated — not even moved (agent-guidelines §2).
		if (clone.hasMissingFont) return unmeasurable('missing-font');

		// Free-standing by design (§2 clone-fidelity gap): parent to the page explicitly so an
		// auto-layout parent can never constrain the clone, then move off-canvas.
		figma.currentPage.appendChild(clone);
		clone.x = -10000;
		clone.y = -10000;

		for (const font of clone.getRangeAllFontNames(0, clone.characters.length)) {
			await figma.loadFontAsync(font);
		}

		const done = (
			verdict: MeasurementVerdict,
			reason: string | undefined,
			size: { width: number; height: number },
		): MeasurementResult => ({
			nodeId: model.nodeId,
			verdict,
			reason,
			measuredWidth: size.width,
			measuredHeight: size.height,
			debug,
		});

		const mode = model.textAutoResize;
		if (mode === 'NONE' || mode === 'TRUNCATE') {
			// Unlock the fixed box so content determines size, and drop truncation so the natural
			// (untruncated) content size is what gets measured.
			clone.textAutoResize = 'WIDTH_AND_HEIGHT';
			clone.textTruncation = 'DISABLED';
			clone.characters = candidateText;
			const measured = readBounds(clone, model.rotation, debug);
			const exceeds = measured.width > ownBounds.width + EPS || measured.height > ownBounds.height + EPS;
			if (!exceeds) return done('fits', undefined, measured);
			// TRUNCATE = truncation already active on a fixed box → content would be ellipsized, not
			// clipped silently (§2 rules table).
			return mode === 'TRUNCATE'
				? done('truncates', 'content exceeds fixed box; truncation active', measured)
				: done('overflows', undefined, measured);
		}

		// Growing modes: HEIGHT keeps width fixed, WIDTH_AND_HEIGHT hugs both. The clone inherits
		// textAutoResize, textTruncation, maxLines, maxHeight — keep them for the capped read.
		clone.characters = candidateText;
		if (model.maxLines !== null) debug.push(`clone.maxLines=${String(clone.maxLines)} (model ${model.maxLines})`);
		if (model.maxHeight !== null)
			debug.push(`clone.maxHeight=${String(clone.maxHeight)} (model ${model.maxHeight})`);
		const capped = readBounds(clone, model.rotation, debug);

		// §2 detection protocol: strip EVERY cap the clone carries, then re-read to observe free
		// growth. LIVE FINDING (2026-07-25 run 1, LS-7.md §6): maxHeight binds on the page-parented
		// clone too — "auto-layout children only" restricts the write, not the enforcement. Run 2
		// showed clearing it did not restore free growth either; the instrumentation below settles
		// whether the null write is silently rejected off auto-layout (cf. the maxLines
		// silent-reject pin) or just doesn't re-derive the box without a forced re-layout.
		let free = capped;
		const truncationActive = model.textTruncation === 'ENDING';
		if (truncationActive || clone.maxHeight !== null) {
			if (truncationActive) clone.textTruncation = 'DISABLED';
			if (clone.maxLines !== null) clone.maxLines = null;
			if (clone.maxHeight !== null) {
				clone.maxHeight = null;
				debug.push(`clone.maxHeight after clear=${String(clone.maxHeight)}`);
			}
			// Force a re-layout before the free read — a cap-clearing write alone may not re-derive
			// the box, but a characters rewrite always does.
			clone.characters = '';
			clone.characters = candidateText;
			free = readBounds(clone, model.rotation, debug);
			debug.push(`capped h=${capped.height.toFixed(2)} free h=${free.height.toFixed(2)}`);
		}

		if (truncationActive && model.maxLines !== null && free.height > capped.height + EPS) {
			return done('truncates', 'maxLines-cap', free);
		}
		// Binding-agnostic maxHeight rule: whether the cap binds on the clone (capped == maxHeight,
		// runs 1-2) or free growth sails past it (free > maxHeight, if clearing ever works), content
		// reaching the cap ⇒ the cap is active ⇒ truncation. Content genuinely shorter than the cap
		// never reaches it, so `fits` is unaffected.
		if (model.maxHeight !== null && Math.max(capped.height, free.height) >= model.maxHeight - EPS) {
			return done('truncates', 'maxHeight-cap', free);
		}

		const container = model.containerBounds;
		if (container === null) return done('fits', 'no-container', free); // parent is the page

		if (mode === 'HEIGHT') {
			// containerAvailableHeight: width is fixed and growth is downward from the node's top
			// edge, so the room left is node-top → container-bottom (offset-aware, not raw height).
			const available = container.y + container.height - ownBounds.y;
			debug.push(`containerAvailableHeight=${available.toFixed(2)}`);
			return free.height > available + EPS
				? done('overflows', 'exceeds-container-height', free)
				: done('fits', undefined, free);
		}
		// WIDTH_AND_HEIGHT: parent-escape only (§2 hug rule; sibling collision out of scope).
		return free.width > container.width + EPS || free.height > container.height + EPS
			? done('overflows', 'parent-escape', free)
			: done('fits', undefined, free);
	} finally {
		clone.remove();
	}
}

// ── Runner: fixture rows (LS-7.md §3 table) with hard-coded candidate text ───
const SHORT = 'OK';
const LONG =
	'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly over it again and again, and then the fox jumps over the lazy dog once more.';

interface SpikeRow {
	label: string;
	candidate: string;
	expected: MeasurementVerdict | 'measurable'; // 'measurable' = any verdict except unmeasurable
}

const rows: SpikeRow[] = [
	{ label: 'fixed-fits', candidate: SHORT, expected: 'fits' },
	{ label: 'fixed-overflows', candidate: LONG, expected: 'overflows' },
	{ label: 'truncate-fits', candidate: SHORT, expected: 'fits' },
	{ label: 'truncate-overflows', candidate: LONG, expected: 'truncates' },
	{ label: 'autoheight-fits', candidate: SHORT, expected: 'fits' },
	{ label: 'autoheight-overflows', candidate: LONG, expected: 'overflows' },
	{ label: 'autoheight-maxlines', candidate: LONG, expected: 'truncates' },
	{ label: 'autoheight-maxheight', candidate: LONG, expected: 'truncates' },
	{ label: 'hug-fits', candidate: SHORT, expected: 'fits' },
	{ label: 'hug-overflows', candidate: LONG, expected: 'overflows' },
	{ label: 'hug-page-parent', candidate: LONG, expected: 'fits' },
	{ label: 'missing-font', candidate: SHORT, expected: 'unmeasurable' },
	{ label: 'mixed-font-ok', candidate: SHORT, expected: 'measurable' },
	{ label: 'rotated-fixed', candidate: LONG, expected: 'overflows' },
];

/** Traverses the open page, measures every labelled fixture node against its hard-coded candidate
 *  text, and logs PASS/FAIL + fidelity observations to the console. Read-only for the user's
 *  document (clones only). */
export async function runOverflowSpike(): Promise<void> {
	// Version banner: if this line is missing from the console, Figma is running a stale main
	// bundle — close and re-run the plugin (and check `npm run dev` rebuilt).
	console.log('[ls7] harness v3 — binding-agnostic maxHeight rule + clear/relayout instrumentation');
	const models = await traverse('page');
	const byName = new Map<string, TextNodeModel>();
	for (const model of models) {
		const node = await figma.getNodeByIdAsync(model.nodeId);
		if (node !== null && !byName.has(node.name)) byName.set(node.name, model);
	}

	if (!rows.some((row) => byName.has(row.label))) {
		console.warn('[ls7] fixture-missing — no overflow-spike labels on this page; open fixtures/overflow-spike.fig');
		return;
	}

	let pass = 0;
	let fail = 0;
	let skip = 0;
	for (const row of rows) {
		const model = byName.get(row.label);
		if (!model) {
			console.warn(`[ls7] ${row.label}: SKIP (label not on this page)`);
			skip++;
			continue;
		}
		const node = await figma.getNodeByIdAsync(model.nodeId);
		if (node === null || node.type !== 'TEXT') {
			console.error(`[ls7] ${row.label}: FAIL (node vanished between scan and measure)`);
			fail++;
			continue;
		}
		try {
			const result = await measureOverflow({ node, model, candidateText: row.candidate });
			const ok = row.expected === 'measurable' ? result.verdict !== 'unmeasurable' : result.verdict === row.expected;
			const line =
				`[ls7] ${row.label}: ${ok ? 'PASS' : 'FAIL'} — verdict=${result.verdict} (expected ${row.expected}), ` +
				`measured=${result.measuredWidth.toFixed(1)}×${result.measuredHeight.toFixed(1)}` +
				(result.reason !== undefined ? `, reason=${result.reason}` : '');
			if (ok) {
				console.log(line);
				pass++;
			} else {
				console.error(line);
				fail++;
			}
			if (result.debug.length > 0) console.log(`[ls7]   ${result.debug.join(' | ')}`);
		} catch (err) {
			console.error(`[ls7] ${row.label}: FAIL — measureOverflow threw: ${err instanceof Error ? err.message : String(err)}`);
			fail++;
		}
	}

	console.log(
		`[ls7] done — ${pass} PASS, ${fail} FAIL, ${skip} SKIP. ` +
			'Record verdicts + the autoheight-maxlines capped/free observation in docs/specs/LS-7.md §6.',
	);
}
