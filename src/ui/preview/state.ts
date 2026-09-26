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
	| { kind: 'loading' }
	| { kind: 'apply-started'; language: string }
	| { kind: 'edit-sent' }
	| { kind: 'result'; language: string; rows: PreviewRow[]; unmatched: string[] }
	| { kind: 'applied'; blocked: BlockedNode[] }
	| { kind: 'revert-started' }
	| { kind: 'reverted' }
	| { kind: 'revert-failed' }
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
		// A failure with no language is the load itself failing (the only failure before an apply);
		// a later successful answer — its Try Again — settles the panel.
		case 'languages':
			return {
				...s,
				languages: [...a.languages],
				phase: s.phase === 'loading' || (s.phase === 'failed' && s.language === null) ? 'idle' : s.phase,
				errorCode: s.phase === 'failed' && s.language === null ? null : s.errorCode,
			};
		// Try Again on a failed load: the busy band while the state request is in flight (LS-34).
		case 'loading':
			return { ...s, phase: 'loading', errorCode: null };
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
		// A failed revert left the preview on the canvas: back to applied, rows and groups kept.
		case 'revert-failed':
			return { ...s, phase: 'applied', errorCode: null };
		// Final review fix: `no-text-nodes`/`no-keys` mean nothing was previewed at all — main
		// restored first and applied nothing — so the canvas has no language on it either. Clearing
		// `language` here (not just `errorCode`) makes the dropdown fall back to its placeholder, so
		// picking the same language again fires a real `onChange` instead of being silently ignored
		// by the native <select> (which fires no change when the value doesn't change).
		case 'failed':
			return {
				...s,
				phase: 'failed',
				errorCode: a.code,
				editing: null,
				language: a.code === 'no-text-nodes' || a.code === 'no-keys' ? null : s.language,
			};
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

/**
 * The language to re-apply after an import (§2.1.7): the one on the canvas right now, when the
 * import replaced it. On the canvas means applied — or a failed edit save, which changes nothing
 * (§2.3), so the preview is still there. Every other failure has already restored the canvas.
 */
export function reapplyAfterImport(s: PreviewState, imported: readonly string[]): string | null {
	if (s.language === null || !imported.includes(s.language)) return null;
	const onCanvas = s.phase === 'applied' || (s.phase === 'failed' && s.errorCode === 'storage-failed');
	return onCanvas ? s.language : null;
}

/**
 * Which of the panel's exchanges a `progress`/`error` answers (LS-34). An import has its own id,
 * apart from the apply/edit/revert `runId`: closing the modal mid-import and then picking a language
 * must not drop the import's progress — that progress is what refreshes the language list. A jump is
 * checked first so a `node-gone` can never pass for a preview failure.
 */
export function messageExchange(
	id: string,
	ids: { importId: string | null; runId: string | null; jumpId: string | null },
): 'import' | 'run' | 'jump' | null {
	if (id === ids.jumpId) return 'jump';
	if (id === ids.importId) return 'import';
	if (id === ids.runId) return 'run';
	return null;
}

/** The command a Preview `runId` message answers. An import has its own id (`messageExchange`). */
export type PendingOp = 'apply' | 'edit' | 'revert' | null;

/**
 * What the panel does with a terminal `error`, so the banner and body never contradict the canvas:
 * - `reapply`: a failed edit may leave other layers translated; re-applying restores first, then
 *   applies, so canvas and panel converge — and if that apply fails, its "restored" copy is true.
 * - `revert-failed`: the preview is still on the canvas; stay applied, banner kept (its Revert
 *   retries).
 * - `failed`: the ordinary failure state — an apply's failure restores the canvas, and a failed edit
 *   save (`storage-failed`) changed nothing.
 */
export function onCommandError(op: PendingOp, code: ErrorCode): 'reapply' | 'revert-failed' | 'failed' {
	if (op === 'revert') return 'revert-failed';
	if (op === 'edit' && code !== 'storage-failed') return 'reapply';
	return 'failed';
}
