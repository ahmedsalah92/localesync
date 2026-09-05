// src/main/overflow/measure.ts  (main thread; uses the `figma` global)
//
// The LS-7 §2 clone measurement protocol, productionised (Approach A: off-canvas temp-node clone).
// Never mutates a user node — measurement touches clones exclusively, and the clone is removed in
// try/finally. One clone serves every candidate: capped reads first, caps stripped once, then free
// reads — so N nodes × M languages is N clones and N font-load passes, not N×M (LS-8 §2).
import type { OverflowReason, OverflowVerdictValue } from '../../common/models';
import type { TextNodeModel } from '../traversal/model';

export interface MeasurementInput {
	node: TextNode; // live node ref (re-fetched via getNodeByIdAsync)
	model: TextNodeModel; // LS-3 model (pre-scanned, provides bounds + flags)
	candidates: readonly string[]; // ONE clone, N candidates
}

export interface Measurement {
	candidate: string;
	verdict: OverflowVerdictValue;
	reason?: OverflowReason;
	/** The FIRST read. For `NONE`/`TRUNCATE` this is the *unlocked* clone, which stops wrapping —
	 *  not commensurable with `overflowPx` and never to be cross-checked against it. */
	measuredWidth: number;
	measuredHeight: number;
	/** Overflow magnitude in px, unrounded. Omitted wherever it is not derivable — see the §2.1
	 *  table in docs/specs/LS-8.2.md, and `OverflowVerdict.overflowPx` in src/common/models.ts. */
	overflowPx?: number;
}

// Float comparisons: Figma stores float32 (dimensions floored at 0.01 — agent-guidelines §2).
const EPS = 0.01;

function readBounds(clone: TextNode): { width: number; height: number } {
	// AABB is the conservative axis-aligned box (correct-by-design for rotated nodes); the LS-7 run
	// confirmed it updates synchronously after a characters write in every mode.
	const box = clone.absoluteBoundingBox;
	if (box === null) return { width: clone.width, height: clone.height };
	return { width: box.width, height: box.height };
}

/**
 * The second read for `NONE` / `TRUNCATE` nodes: the magnitude pass (LS-8.2 §1.1.2).
 *
 * The verdict pass above unlocks the clone to `WIDTH_AND_HEIGHT`, which is correct for answering
 * "does the content fit" but useless for "by how much" — an unlocked clone stops wrapping. The LS-7
 * run recorded `fixed-overflows` at 1244.0 × 19.0 against a 200 × 40 box: a single unwrapped line.
 * Subtracting gives 1044px, the length of a line the user will never see, where the real overshoot
 * of the wrapped text is on the order of tens of pixels.
 *
 * So the clone is re-constrained to the original's width in `HEIGHT` mode and every non-`fits`
 * candidate re-read. Both axes are compared, not height alone: a wrapped phrase overshoots the box
 * height, while a single unbroken token — exactly what `expand.ts` produces for any source of 20
 * characters or fewer, the German compound-noun case the feature exists for — cannot wrap and
 * overshoots the box *width*.
 *
 * Runs as a second pass, never interleaved with the verdict loop. Verdicts are all computed and
 * pushed before the first write here lands, so the reconfiguration cannot retro-corrupt them.
 *
 * Reference is `node.width`/`node.height`, NOT `model.ownBounds`. `ownBounds` is
 * `absoluteBoundingBox` — an axis-aligned box, so for the `rotated-fixed` fixture row (30°) it is
 * `w·|cosθ| + h·|sinθ|`, inflated. Constraining to that width would measure the wrong box and
 * compare against the wrong reference, and the delta can come out ≤ 0 on a row whose verdict is
 * `overflows`. `node.width`/`clone.width` are unrotated layout dimensions on both sides, and are
 * identical to `ownBounds` for every unrotated node. (LS-8.2 §2.1 says "at `ownBounds.width`"; this
 * is a precision fix proposed back to the spec.)
 *
 * No `await` anywhere: the pass cannot yield to `figma.ui.onmessage` mid-clone, and the caller's
 * `finally { clone.remove() }` still covers it.
 */
function applyFixedBoxMagnitude(
	clone: TextNode,
	node: TextNode,
	candidates: readonly string[],
	results: Measurement[],
): void {
	if (node.width <= EPS) return;
	if (!results.some((result) => result.verdict !== 'fits')) return; // nothing to measure

	// Mode BEFORE resize. Setting `HEIGHT` first pins the clone as auto-height/fixed-width, which is
	// the documented resizable configuration; resizing a still-hugging node is not a pinned surface.
	// Plain `resize()` and not `resizeWithoutConstraints()`, which resets `textAutoResize` and would
	// undo the line above (agent-guidelines §2) — constraint re-application is a non-issue because a
	// TEXT node has no children and the clone is parented to the page.
	clone.textAutoResize = 'HEIGHT';
	clone.resize(node.width, clone.height);
	// Re-assert: the verdict pass cleared truncation, and a TRUNCATE clone must not re-cap here.
	clone.textTruncation = 'DISABLED';

	// If the resize was silently rejected the way `maxHeight = null` is off auto-layout, the reads
	// below would be the ~1044px unwrapped line this pass exists to avoid. Omitting the field beats
	// reporting a confident wrong number — the same posture `maxHeight-cap` takes.
	if (Math.abs(clone.width - node.width) > EPS) return;

	for (const [i, candidate] of candidates.entries()) {
		const target = results[i];
		if (target === undefined || target.verdict === 'fits') continue;
		clone.characters = candidate;
		const overflowPx = Math.max(clone.width - node.width, clone.height - node.height);
		if (overflowPx > EPS) target.overflowPx = overflowPx;
	}
}

/** Off-canvas clone, per-mode rule, `clone.remove()` in `finally`. Never mutates a user node.
 *  Returns one Measurement per candidate, input order preserved. */
export async function measureOverflow(input: MeasurementInput): Promise<Measurement[]> {
	const { node, model, candidates } = input;
	const allUnmeasurable = (reason: OverflowReason): Measurement[] =>
		candidates.map((candidate) => ({
			candidate,
			verdict: 'unmeasurable',
			reason,
			measuredWidth: 0,
			measuredHeight: 0,
		}));

	// Unmeasurable gates resolved from the model before any clone exists (LS-7 §2 + the §6
	// `no-bounds` delta).
	if (model.empty) return allUnmeasurable('empty');
	if (model.hasMissingFont) return allUnmeasurable(model.isMixedFont ? 'mixed-font-missing' : 'missing-font');
	const ownBounds = model.ownBounds;
	if (ownBounds === null) return allUnmeasurable('no-bounds');
	if (candidates.length === 0) return [];

	const clone = node.clone();
	try {
		// Re-check on the live clone BEFORE any write: a font may have gone missing since the scan,
		// and a missing-font node must never be mutated — not even moved (agent-guidelines §2).
		if (clone.hasMissingFont) return allUnmeasurable('missing-font');

		// Free-standing by design (LS-7 §2 clone-fidelity gap): parent to the page explicitly so an
		// auto-layout parent can never constrain the clone, then move off-canvas.
		figma.currentPage.appendChild(clone);
		clone.x = -10000;
		clone.y = -10000;

		// One font-load pass per node, reused across every candidate.
		for (const font of clone.getRangeAllFontNames(0, clone.characters.length)) {
			await figma.loadFontAsync(font);
		}

		const results: Measurement[] = [];
		const measurement = (
			candidate: string,
			verdict: OverflowVerdictValue,
			reason: OverflowReason | undefined,
			size: { width: number; height: number },
			overflowPx?: number,
		): Measurement => {
			const m: Measurement = {
				candidate,
				verdict,
				measuredWidth: size.width,
				measuredHeight: size.height,
			};
			if (reason !== undefined) m.reason = reason;
			// One place owns the omit rule: no field where there is no magnitude. A zero or negative
			// delta means the reference and the read disagree, which is not a measurement.
			if (overflowPx !== undefined && overflowPx > EPS) m.overflowPx = overflowPx;
			return m;
		};

		// Deprecation pin (agent-guidelines §2): `TRUNCATE` is `NONE` + `textTruncation: 'ENDING'`
		// internally, so its eventual removal from reads is a no-op here.
		const mode = model.textAutoResize;
		if (mode === 'NONE' || mode === 'TRUNCATE') {
			const truncationEnabled = mode === 'TRUNCATE' || model.textTruncation === 'ENDING';
			// Unlock the fixed box once so content determines size; drop truncation so the natural
			// (untruncated) content size is what gets measured.
			clone.textAutoResize = 'WIDTH_AND_HEIGHT';
			clone.textTruncation = 'DISABLED';
			for (const candidate of candidates) {
				clone.characters = candidate;
				const measured = readBounds(clone);
				const exceeds = measured.width > ownBounds.width + EPS || measured.height > ownBounds.height + EPS;
				if (!exceeds) results.push(measurement(candidate, 'fits', undefined, measured));
				// Truncation active on a fixed box → content would be ellipsized, not clipped silently.
				else if (truncationEnabled) results.push(measurement(candidate, 'truncates', 'truncated-fixed-box', measured));
				else results.push(measurement(candidate, 'overflows', 'exceeds-fixed-box', measured));
			}
			applyFixedBoxMagnitude(clone, node, candidates, results);
			return results;
		}

		// Growing modes: HEIGHT keeps width fixed, WIDTH_AND_HEIGHT hugs both. The clone inherits
		// textAutoResize, textTruncation, maxLines, maxHeight — keep them for the capped reads.
		const capped: { width: number; height: number }[] = [];
		for (const candidate of candidates) {
			clone.characters = candidate;
			capped.push(readBounds(clone));
		}

		// Free-growth reads: strip EVERY cap once, then re-read each candidate. The `maxHeight = null`
		// write is silently rejected off auto-layout (LS-7 §6 pin) — fine, because maxHeight detection
		// below is binding-agnostic and never relies on the clear taking effect. A characters rewrite
		// forces the re-layout a cap-clearing write alone may not trigger.
		const truncationActive = model.textTruncation === 'ENDING';
		let free = capped;
		if (truncationActive || clone.maxHeight !== null) {
			if (truncationActive) clone.textTruncation = 'DISABLED';
			if (clone.maxLines !== null) clone.maxLines = null;
			if (clone.maxHeight !== null) clone.maxHeight = null;
			free = [];
			for (const candidate of candidates) {
				clone.characters = '';
				clone.characters = candidate;
				free.push(readBounds(clone));
			}
		}

		for (const [i, candidate] of candidates.entries()) {
			const cappedSize = capped[i] ?? { width: 0, height: 0 };
			const freeSize = free[i] ?? cappedSize;

			if (truncationActive && model.maxLines !== null && freeSize.height > cappedSize.height + EPS) {
				// The branch condition is itself the proof the delta is positive.
				results.push(
					measurement(candidate, 'truncates', 'maxLines-cap', freeSize, freeSize.height - cappedSize.height),
				);
				continue;
			}
			// Binding-agnostic maxHeight rule (LS-7 §6): content *reaching* the cap — pinned at exactly
			// maxHeight or grown past it — proves the cap is active; genuinely shorter content never
			// reaches it, so `fits` is unaffected.
			if (model.maxHeight !== null && Math.max(cappedSize.height, freeSize.height) >= model.maxHeight - EPS) {
				// NO magnitude: the clone inherits the cap and `maxHeight = null` is silently rejected
				// off auto-layout (LS-7 run 3 measured exactly 200.0 × 50.0 after the clear and a
				// forced re-layout), so free growth is pinned AT the cap and the hidden height cannot
				// be reached. `max(0, free − maxHeight)` yields 0, and rendering `clips 0px` asserts a
				// measurement we do not have. The verdict still stands on the binding-agnostic rule:
				// reaching the cap is observable, the distance beyond it is not (LS-8.2 §2.1).
				results.push(measurement(candidate, 'truncates', 'maxHeight-cap', freeSize));
				continue;
			}

			const container = model.containerBounds;
			if (container === null) {
				// Parent is the page — no constraining container (LS-7 §2).
				results.push(measurement(candidate, 'fits', 'no-container', freeSize));
				continue;
			}

			if (mode === 'HEIGHT') {
				// Offset-aware containerAvailableHeight (LS-7 §6): the node's top edge is fixed and
				// growth is downward, so the room left is node-top → container-bottom.
				const available = container.y + container.height - ownBounds.y;
				if (freeSize.height > available + EPS) {
					results.push(
						measurement(
							candidate,
							'overflows',
							'exceeds-container-height',
							freeSize,
							freeSize.height - available,
						),
					);
				} else {
					results.push(measurement(candidate, 'fits', undefined, freeSize));
				}
				continue;
			}

			// WIDTH_AND_HEIGHT: parent-escape only (sibling collision is Phase 2 — LS-7 §2).
			if (freeSize.width > container.width + EPS || freeSize.height > container.height + EPS) {
				// Larger of the two positive overshoots — selects the triggering axis without
				// recording which one it was. The fixed-box magnitude uses the same arithmetic.
				const escape = Math.max(freeSize.width - container.width, freeSize.height - container.height);
				results.push(measurement(candidate, 'overflows', 'parent-escape', freeSize, escape));
			} else {
				results.push(measurement(candidate, 'fits', undefined, freeSize));
			}
		}
		return results;
	} finally {
		clone.remove();
	}
}
