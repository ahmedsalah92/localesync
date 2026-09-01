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
	measuredWidth: number;
	measuredHeight: number;
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
		): Measurement => {
			const m: Measurement = {
				candidate,
				verdict,
				measuredWidth: size.width,
				measuredHeight: size.height,
			};
			if (reason !== undefined) m.reason = reason;
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
				results.push(measurement(candidate, 'truncates', 'maxLines-cap', freeSize));
				continue;
			}
			// Binding-agnostic maxHeight rule (LS-7 §6): content *reaching* the cap — pinned at exactly
			// maxHeight or grown past it — proves the cap is active; genuinely shorter content never
			// reaches it, so `fits` is unaffected.
			if (model.maxHeight !== null && Math.max(cappedSize.height, freeSize.height) >= model.maxHeight - EPS) {
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
					results.push(measurement(candidate, 'overflows', 'exceeds-container-height', freeSize));
				} else {
					results.push(measurement(candidate, 'fits', undefined, freeSize));
				}
				continue;
			}

			// WIDTH_AND_HEIGHT: parent-escape only (sibling collision is Phase 2 — LS-7 §2).
			if (freeSize.width > container.width + EPS || freeSize.height > container.height + EPS) {
				results.push(measurement(candidate, 'overflows', 'parent-escape', freeSize));
			} else {
				results.push(measurement(candidate, 'fits', undefined, freeSize));
			}
		}
		return results;
	} finally {
		clone.remove();
	}
}
