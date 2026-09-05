// src/ui/overflow/state.ts
//
// The overflow panel's scan-state reducer and its derived selectors (LS-8.2 §1.8).
//
// Pure and DOM-free by design: it imports types from `common` and the pure functions from
// `common/overflow`, and nothing else. In particular it must never reach `./bridge` — that module
// assigns a `window` listener at module scope, and this file's tests run under Vitest's plain Node
// environment (agent-guidelines §6: no jsdom). The same constraint is why `tabs.ts` exists.
import { matchesFilter, sortVerdicts, type OverflowFilter, type OverflowSort } from '../../common/overflow';
import type { ErrorCode, ScanScope } from '../../common/messages';
import type { OverflowVerdict } from '../../common/models';

export type ScanPhase = 'idle' | 'scanning' | 'done' | 'stopped' | 'failed';

export interface OverflowState {
	phase: ScanPhase;
	language: string; // bare subtag; the value sent in targetLanguages
	scope: ScanScope;
	filter: OverflowFilter;
	sort: OverflowSort;
	verdicts: OverflowVerdict[]; // accumulated across partials, replaced by the final result
	completed: number;
	total: number;
	selectedNodeId: string | null;
	errorCode: ErrorCode | null;
}

export type OverflowAction =
	| { kind: 'set-language'; language: string }
	| { kind: 'set-scope'; scope: ScanScope }
	| { kind: 'set-filter'; filter: OverflowFilter }
	| { kind: 'set-sort'; sort: OverflowSort }
	| { kind: 'scan-started' }
	| { kind: 'progress'; completed: number; total: number }
	| { kind: 'partial'; verdicts: OverflowVerdict[] }
	| { kind: 'result'; verdicts: OverflowVerdict[]; stopped: boolean }
	| { kind: 'failed'; code: ErrorCode }
	| { kind: 'select'; nodeId: string };

/** A factory rather than a frozen const, so each mount gets its own `verdicts` array.
 *  German is the default target, not the canvas's French: French carries factor 0.95, the
 *  second-lowest in the table — the weakest possible first run for a tool whose entire pitch is
 *  catching what shallow tools miss. German is 1.15, the canonical expansion case (LS-8.2 §2.2). */
export function initialOverflowState(): OverflowState {
	return {
		phase: 'idle',
		language: 'de',
		scope: 'page',
		filter: 'issues',
		sort: 'severity',
		verdicts: [],
		completed: 0,
		total: 0,
		selectedNodeId: null,
		errorCode: null,
	};
}

export function overflowReducer(state: OverflowState, action: OverflowAction): OverflowState {
	switch (action.kind) {
		// The selects carry `disabled` while a scan runs (LS-8.2 §2.3); that is the enforcement, not
		// a guard here. These stay unconditional so the controls remain the single source of truth.
		case 'set-language':
			return { ...state, language: action.language };
		case 'set-scope':
			return { ...state, scope: action.scope };
		case 'set-filter':
			return { ...state, filter: action.filter };
		case 'set-sort':
			return { ...state, sort: action.sort };

		// Clears the previous run. Without this, a second scan would show the first one's rows until
		// its own first partial arrived — and a shorter second scan would keep rows that no longer
		// exist. §3.1 covers dedupe *within* a scan; this covers it across scans.
		case 'scan-started':
			return { ...state, phase: 'scanning', verdicts: [], completed: 0, total: 0, selectedNodeId: null, errorCode: null };

		// Both are guarded on the phase: the panel already filters by correlation id, and this is the
		// second net, for a tick that lands after the result in the same frame.
		case 'progress':
			if (state.phase !== 'scanning') return state;
			return { ...state, completed: action.completed, total: action.total };
		case 'partial':
			if (state.phase !== 'scanning') return state;
			return { ...state, verdicts: [...state.verdicts, ...action.verdicts] };

		// REPLACES rather than appends: the result carries the complete set, including everything
		// already streamed, so appending would double every row that arrived on a partial.
		// `completed`/`total` are left alone — the engine's final tick is what makes them exact, and
		// re-deriving `completed` from `verdicts.length` breaks the moment the Phase 2 matrix ships
		// more than one language per node.
		case 'result':
			return { ...state, phase: action.stopped ? 'stopped' : 'done', verdicts: [...action.verdicts] };

		case 'failed':
			return { ...state, phase: 'failed', errorCode: action.code };
		case 'select':
			return { ...state, selectedNodeId: action.nodeId };
	}
}

/** Filter, then sort, over a copy. The rendered rows. Never mutates `state.verdicts` — `filter`
 *  returns a new array and `sortVerdicts` copies again, so that is structural, not a promise. */
export function visibleVerdicts(state: OverflowState): OverflowVerdict[] {
	return sortVerdicts(
		state.verdicts.filter((verdict) => matchesFilter(verdict, state.filter)),
		state.sort,
	);
}

/** The running yield shown while scanning: everything accumulated so far that is not `fits`.
 *  Derived, never sent over the wire — no `found` count crosses the bridge (LS-8.2 §1.2). */
export function foundCount(state: OverflowState): number {
	return state.verdicts.filter((verdict) => verdict.verdict !== 'fits').length;
}
