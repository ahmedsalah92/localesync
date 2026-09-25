// src/ui/preview/state.ts — the Preview panel's reducer (LS-12 §2.5). Pure and DOM-free; never
// imports ../bridge (its tests run in plain Node). Decision logic lives here, not in the component.
import type { ErrorCode } from '../../common/messages';
import type { BlockedNode, PreviewRow } from '../../common/models';

export type PreviewPhase = 'loading' | 'idle' | 'applying' | 'applied' | 'reverting' | 'failed';
/** The reasons withSnapshot can block the 'preview' op for (src/main/snapshot/plan.ts). */
export type SkippedReason = 'missing-font' | 'mixed-font-char-mutation' | 'already-mutated' | 'empty';
export const SKIPPED_ORDER: readonly SkippedReason[] = [
	'missing-font',
	'mixed-font-char-mutation',
	'already-mutated',
	'empty',
];
export type GroupKey = 'unmatched' | `skipped:${SkippedReason}`;

export interface PreviewState {
	phase: PreviewPhase;
	languages: string[];
	/** The language applied, or being applied; null before the first apply and after a revert. */
	language: string | null;
	rows: PreviewRow[];
	unmatched: string[];
	blocked: BlockedNode[];
	editing: { nodeId: string; draft: string } | null;
	expanded: GroupKey[];
	selectedNodeId: string | null;
	errorCode: ErrorCode | null;
}

export type PreviewAction =
	| { kind: 'languages'; languages: string[] }
	| { kind: 'apply-started'; language: string }
	| { kind: 'edit-sent' }
	| { kind: 'result'; language: string; rows: PreviewRow[]; unmatched: string[] }
	| { kind: 'applied'; blocked: BlockedNode[] }
	| { kind: 'revert-started' }
	| { kind: 'reverted' }
	| { kind: 'failed'; code: ErrorCode }
	| { kind: 'edit-start'; nodeId: string; value: string }
	| { kind: 'edit-change'; draft: string }
	| { kind: 'edit-cancel' }
	| { kind: 'select'; nodeId: string }
	| { kind: 'toggle-group'; key: GroupKey };

export function initialPreviewState(): PreviewState {
	return {
		phase: 'loading',
		languages: [],
		language: null,
		rows: [],
		unmatched: [],
		blocked: [],
		editing: null,
		expanded: [],
		selectedNodeId: null,
		errorCode: null,
	};
}

export function previewReducer(s: PreviewState, a: PreviewAction): PreviewState {
	switch (a.kind) {
		case 'languages':
			return { ...s, languages: [...a.languages], phase: s.phase === 'loading' ? 'idle' : s.phase };
		case 'apply-started':
			return {
				...s,
				phase: 'applying',
				language: a.language,
				rows: [],
				unmatched: [],
				blocked: [],
				editing: null,
				errorCode: null,
			};
		// An edit keeps the rows it is about to replace; the result that follows replaces them.
		case 'edit-sent':
			return { ...s, phase: 'applying', editing: null, errorCode: null };
		case 'result':
			return { ...s, language: a.language, rows: [...a.rows], unmatched: [...a.unmatched] };
		case 'applied':
			return { ...s, phase: 'applied', blocked: [...a.blocked] };
		case 'revert-started':
			return { ...s, phase: 'reverting', editing: null, errorCode: null };
		case 'reverted':
			return {
				...s,
				phase: 'idle',
				language: null,
				rows: [],
				unmatched: [],
				blocked: [],
				expanded: [],
				selectedNodeId: null,
			};
		case 'failed':
			return { ...s, phase: 'failed', errorCode: a.code, editing: null };
		case 'edit-start':
			return { ...s, editing: { nodeId: a.nodeId, draft: a.value } };
		case 'edit-change':
			return s.editing === null ? s : { ...s, editing: { ...s.editing, draft: a.draft } };
		case 'edit-cancel':
			return { ...s, editing: null };
		case 'select':
			return { ...s, selectedNodeId: a.nodeId };
		case 'toggle-group':
			return {
				...s,
				expanded: s.expanded.includes(a.key) ? s.expanded.filter((k) => k !== a.key) : [...s.expanded, a.key],
			};
	}
}

export function isBusy(phase: PreviewPhase): boolean {
	return phase === 'loading' || phase === 'applying' || phase === 'reverting';
}

export type PreviewShell =
	| 'busy'
	| 'no-languages'
	| 'no-keys'
	| 'no-text-on-page'
	| 'storage-failed'
	| 'operation-failed'
	| 'choose-language'
	| null;

/** Busy first, as LS-30 established: a retry or a switch never shows the state it is leaving. */
export function selectShell(s: PreviewState): PreviewShell {
	if (isBusy(s.phase)) return 'busy';
	if (s.phase === 'failed') {
		switch (s.errorCode) {
			case 'no-keys':
				return 'no-keys';
			case 'no-text-nodes':
				return 'no-text-on-page';
			case 'storage-failed':
				return 'storage-failed';
			default:
				return 'operation-failed';
		}
	}
	if (s.languages.length === 0) return 'no-languages';
	if (s.phase === 'applied') return null;
	return 'choose-language';
}

export function translatedCount(rows: readonly PreviewRow[]): number {
	return rows.filter((row) => row.value !== null).length;
}

/** What committing the open editor sends, or null when there is nothing to send (Review Focus 5). */
export function commitDecision(s: PreviewState): { key: string; value: string | null } | null {
	if (s.editing === null) return null;
	const { nodeId, draft } = s.editing;
	const row = s.rows.find((r) => r.nodeId === nodeId);
	if (row === undefined) return null;
	const current = row.value ?? row.source;
	if (draft === current) return null;
	return { key: row.key, value: draft === '' ? null : draft };
}
