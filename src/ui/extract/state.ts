// src/ui/extract/state.ts
//
// The Extract panel's pass-state reducer and its derived selectors (LS-9 §1.4).
//
// Pure and DOM-free by design: it imports types from `common` and nothing else. In particular it
// must never reach `./bridge` — that module assigns a `window` listener at module scope, and this
// file's tests run under Vitest's plain Node environment (agent-guidelines §6: no jsdom).
import type { ErrorCode, ScanScope } from '../../common/messages';
import type { BlockedNode, ExtractedString } from '../../common/models';

export type ExtractPhase = 'idle' | 'scanning' | 'done' | 'failed';

export interface ExtractState {
	phase: ExtractPhase;
	scope: ScanScope;
	entries: ExtractedString[];
	blocked: BlockedNode[]; // rejected stamps from the last pass — not rendered until DES-2 supplies copy
	completed: number;
	total: number;
	selectedNodeId: string | null;
	errorCode: ErrorCode | null;
}

export type ExtractAction =
	| { kind: 'set-scope'; scope: ScanScope }
	| { kind: 'scan-started' }
	| { kind: 'progress'; completed: number; total: number }
	| { kind: 'result'; entries: ExtractedString[]; blocked: BlockedNode[] }
	| { kind: 'failed'; code: ErrorCode }
	| { kind: 'select'; nodeId: string };

/** A factory rather than a frozen const, so each mount gets its own `entries` array. */
export function initialExtractState(): ExtractState {
	return {
		phase: 'idle',
		scope: 'page',
		entries: [],
		blocked: [],
		completed: 0,
		total: 0,
		selectedNodeId: null,
		errorCode: null,
	};
}

export function extractReducer(state: ExtractState, action: ExtractAction): ExtractState {
	switch (action.kind) {
		// The select carries `disabled` while a pass runs; that is the enforcement, not a guard here.
		case 'set-scope':
			return { ...state, scope: action.scope };

		// Clears the previous run, so a shorter second pass cannot keep rows that no longer exist.
		case 'scan-started':
			return {
				...state,
				phase: 'scanning',
				entries: [],
				blocked: [],
				completed: 0,
				total: 0,
				selectedNodeId: null,
				errorCode: null,
			};

		// Guarded on the phase: the panel already filters by correlation id, and this is the second net
		// for a tick landing after the result in the same frame.
		case 'progress':
			if (state.phase !== 'scanning') return state;
			return { ...state, completed: action.completed, total: action.total };

		// No streaming: extraction sends no partials, so the result is the whole set.
		case 'result':
			return { ...state, phase: 'done', entries: [...action.entries], blocked: [...action.blocked] };

		case 'failed':
			return { ...state, phase: 'failed', errorCode: action.code };
		case 'select':
			return { ...state, selectedNodeId: action.nodeId };
	}
}

/** Exact-value grouping, matching LS-6's dedup rule so the marker predicts what
 *  dedup would collapse. Keyed by nodeId; 1 means not duplicated. */
export function occurrenceCounts(entries: readonly ExtractedString[]): ReadonlyMap<string, number> {
	const byValue = new Map<string, number>();
	for (const entry of entries) byValue.set(entry.value, (byValue.get(entry.value) ?? 0) + 1);
	return new Map(entries.map((entry) => [entry.nodeId, byValue.get(entry.value) ?? 1]));
}

/** Derived from `drifted`, never sent as a scalar. */
export function driftedCount(entries: readonly ExtractedString[]): number {
	return entries.filter((entry) => entry.drifted).length;
}
