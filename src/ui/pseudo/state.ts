// src/ui/pseudo/state.ts
//
// The Pseudo-loc panel's reducer and its derived selectors (LS-10 §2).
//
// Pure and DOM-free by design, like extract/state.ts: it imports types from `common` and nothing
// else. In particular it must never reach `./bridge` — that module assigns a `window` listener at
// module scope, and this file's tests run under Vitest's plain Node environment.
import type { ErrorCode } from '../../common/messages';
import type { BlockedNode, ExtractedString, PseudoLocOptions } from '../../common/models';

/**
 * `idle` shows the designed first-run state; rows exist only once applied.
 *
 * There is no pre-apply row list, and that is the built design rather than a simplification: the
 * canvas carries a `Pseudo-loc Applied` shell plus empty states and nothing in between, and the
 * first-run copy — "Select a frame or layer, then set an expansion ratio to preview…" — describes
 * exactly this flow (LS-10 §2.18).
 */
export type PseudoPhase = 'idle' | 'applying' | 'applied' | 'reverting' | 'failed';

export interface PseudoState {
	phase: PseudoPhase;
	options: PseudoLocOptions;
	/** Source strings and their LS-9 keys, from the extraction that accompanies Apply. */
	entries: ExtractedString[];
	/** Skipped nodes from the last run — the `nodes-blocked` warning's payload. */
	blocked: BlockedNode[];
	/** The options the CURRENT canvas state was applied with, so the banner cannot drift from it. */
	appliedWith: PseudoLocOptions | null;
	selectedNodeId: string | null;
	errorCode: ErrorCode | null;
}

export type PseudoAction =
	| { kind: 'set-options'; options: Partial<PseudoLocOptions> }
	| { kind: 'apply-started' }
	| { kind: 'applied'; entries: ExtractedString[]; blocked: BlockedNode[] }
	| { kind: 'revert-started' }
	| { kind: 'reverted' }
	| { kind: 'failed'; code: ErrorCode }
	| { kind: 'select'; nodeId: string };

/** LS-10 §2.1 defaults, as built on canvas. */
export const DEFAULT_OPTIONS: PseudoLocOptions = { expansionPct: 40, accent: 'full', markers: 'double' };

/** A factory rather than a frozen const, so each mount gets its own arrays. */
export function initialPseudoState(): PseudoState {
	return {
		phase: 'idle',
		options: { ...DEFAULT_OPTIONS },
		entries: [],
		blocked: [],
		appliedWith: null,
		selectedNodeId: null,
		errorCode: null,
	};
}

export function pseudoReducer(state: PseudoState, action: PseudoAction): PseudoState {
	switch (action.kind) {
		// Changing an option does NOT re-apply (§2.6): apply is explicit, because this mutates the
		// user's file. `appliedWith` therefore stays put, and the banner keeps naming the ratio the
		// canvas actually holds rather than the one now selected in the control bar.
		case 'set-options':
			return { ...state, options: { ...state.options, ...action.options } };

		case 'apply-started':
			return { ...state, phase: 'applying', blocked: [], errorCode: null };

		// The options are snapshotted into `appliedWith` here, not read from `state.options` later.
		case 'applied':
			return {
				...state,
				phase: 'applied',
				entries: [...action.entries],
				blocked: [...action.blocked],
				appliedWith: { ...state.options },
			};

		case 'revert-started':
			return { ...state, phase: 'reverting', errorCode: null };

		// Back to the first-run surface: with the canvas restored there is nothing to list.
		case 'reverted':
			return {
				...state,
				phase: 'idle',
				entries: [],
				blocked: [],
				appliedWith: null,
				selectedNodeId: null,
			};

		case 'failed':
			return { ...state, phase: 'failed', errorCode: action.code, appliedWith: null };

		case 'select':
			return { ...state, selectedNodeId: action.nodeId };
	}
}

/** True while a canvas mutation is in flight — the controls and Apply are disabled throughout. */
export function isBusy(phase: PseudoPhase): boolean {
	return phase === 'applying' || phase === 'reverting';
}

/**
 * How many distinct fonts the skipped nodes blame, for the `fonts-unavailable` copy's count.
 *
 * `BlockedNode` carries a reason, not a font name, so this counts NODES blocked for `missing-font`
 * rather than unique font families. The canvas copy says "N fonts could not be loaded"; the honest
 * number available at this layer is the node count, and conflating them would overstate. Flagged in
 * §Carried forward for LS-14 to reword.
 */
export function missingFontCount(blocked: readonly BlockedNode[]): number {
	return blocked.filter((entry) => entry.reason === 'missing-font').length;
}
