// src/ui/rtl/state.ts
//
// The RTL Mirror panel's reducer (LS-11 §2).
//
// Pure and DOM-free, like pseudo/state.ts: it imports types from `common` and nothing else, and must
// never reach `./bridge` — that module assigns a `window` listener at module scope and this file's
// tests run under Vitest's plain Node environment.
import type { ErrorCode } from '../../common/messages';
import type { BlockedNode, FlaggedNode } from '../../common/models';

/**
 * There is no pre-apply row list, matching the built design: the canvas carries an
 * `RTL Mirror Applied` shell plus empty states and nothing in between.
 *
 * Unlike pseudo-loc there is no `applying` → options step, because there are no options — the whole
 * control is one Switch, so the phase IS the toggle's state (LS-11 §2.7).
 */
export type RtlPhase = 'idle' | 'applying' | 'applied' | 'reverting' | 'failed';

export interface RtlState {
	phase: RtlPhase;
	/** Nodes the mirror moved but could not rotate — the review list (G1). */
	flagged: FlaggedNode[];
	/** Skipped nodes from the last run — the `nodes-blocked` warning's payload. */
	blocked: BlockedNode[];
	selectedNodeId: string | null;
	errorCode: ErrorCode | null;
}

export type RtlAction =
	| { kind: 'apply-started' }
	| { kind: 'flagged'; flagged: FlaggedNode[] }
	| { kind: 'applied'; blocked: BlockedNode[] }
	| { kind: 'revert-started' }
	| { kind: 'reverted' }
	| { kind: 'failed'; code: ErrorCode }
	| { kind: 'select'; nodeId: string };

/** A factory rather than a frozen const, so each mount gets its own arrays. */
export function initialRtlState(): RtlState {
	return { phase: 'idle', flagged: [], blocked: [], selectedNodeId: null, errorCode: null };
}

export function rtlReducer(state: RtlState, action: RtlAction): RtlState {
	switch (action.kind) {
		case 'apply-started':
			return { ...state, phase: 'applying', flagged: [], blocked: [], errorCode: null };

		// `rtl-flagged` arrives BEFORE the terminal progress, so this lands while still `applying`
		// and must not itself move the phase on — otherwise a run with nothing to review and a run
		// with a review list would take different paths to `applied`.
		case 'flagged':
			return { ...state, flagged: [...action.flagged] };

		case 'applied':
			return { ...state, phase: 'applied', blocked: [...action.blocked] };

		case 'revert-started':
			return { ...state, phase: 'reverting', errorCode: null };

		// Back to the first-run surface: with the canvas restored there is nothing to review.
		case 'reverted':
			return { ...state, phase: 'idle', flagged: [], blocked: [], selectedNodeId: null };

		case 'failed':
			return { ...state, phase: 'failed', errorCode: action.code, flagged: [] };

		case 'select':
			return { ...state, selectedNodeId: action.nodeId };
	}
}

/** True while a canvas mutation is in flight — the toggle is disabled throughout. */
export function isBusy(phase: RtlPhase): boolean {
	return phase === 'applying' || phase === 'reverting';
}

/** The Switch is on whenever the mirror is applied or being applied, so it never flickers back
 *  mid-run and never reads "off" over a mirrored canvas. */
export function isMirrorOn(phase: RtlPhase): boolean {
	return phase === 'applied' || phase === 'applying';
}

/** Nodes blocked for a missing font — the `fonts-unavailable` count (LS-11 §2.6: only TEXT nodes
 *  can be blocked this way, because only the text-alignment rule writes to one). */
export function missingFontCount(blocked: readonly BlockedNode[]): number {
	return blocked.filter((entry) => entry.reason === 'missing-font').length;
}
