// src/ui/preview/rows.ts — the Preview state as the flat list of rows the panel renders (LS-12 §2.4).
// Pure, apart from the panel, for the same reason as src/ui/rtl/rows.ts.
import type { DropdownOption } from '../shell/primitives/Dropdown';
import type { RowTone } from '../shell/ResultsRow';
import { languageLabel } from './locale';
import {
	EDITING_VERDICT,
	LABELS,
	SKIPPED_REASON,
	UNNAMED_LAYER,
	fallbackVerdict,
	skippedGroup,
	unmatchedGroup,
} from './copy';
import { SKIPPED_ORDER, type GroupKey, type PreviewState } from './state';

export type PreviewRowModel =
	| {
			kind: 'string';
			id: string;
			nodeId: string;
			key: string;
			primary: string;
			tone: RowTone;
			verdict: string | undefined;
			editing: boolean;
	  }
	| { kind: 'group'; id: GroupKey; primary: string; meta: string; expanded: boolean }
	| { kind: 'child'; id: string; nodeId: string | null; primary: string; meta: string };

const displayName = (name: string | undefined): string =>
	name !== undefined && name.trim() !== '' ? name : UNNAMED_LAYER;

export function previewRows(s: PreviewState): PreviewRowModel[] {
	const out: PreviewRowModel[] = [];
	for (const row of s.rows) {
		const editing = s.editing?.nodeId === row.nodeId;
		out.push({
			kind: 'string',
			id: row.nodeId,
			nodeId: row.nodeId,
			key: row.key,
			primary: row.value ?? row.source,
			tone: editing ? 'editing' : row.value === null ? 'truncates' : 'fits',
			verdict: editing
				? EDITING_VERDICT
				: row.value === null && s.language !== null
					? fallbackVerdict(s.language)
					: undefined,
			editing,
		});
	}
	if (s.unmatched.length > 0) {
		const open = s.expanded.includes('unmatched');
		out.push({
			kind: 'group',
			id: 'unmatched',
			primary: unmatchedGroup(s.unmatched.length),
			meta: 'check your translation file',
			expanded: open,
		});
		if (open)
			for (const key of s.unmatched)
				out.push({
					kind: 'child',
					id: `unmatched:${key}`,
					nodeId: null,
					primary: key,
					meta: 'no layer has this key',
				});
	}
	for (const reason of SKIPPED_ORDER) {
		const nodes = s.blocked.filter((b) => b.reason === reason);
		if (nodes.length === 0) continue;
		const key: GroupKey = `skipped:${reason}`;
		const open = s.expanded.includes(key);
		out.push({
			kind: 'group',
			id: key,
			primary: skippedGroup(nodes.length),
			meta: SKIPPED_REASON[reason],
			expanded: open,
		});
		if (open)
			for (const node of nodes)
				out.push({
					kind: 'child',
					id: `${key}:${node.nodeId}`,
					nodeId: node.nodeId,
					primary: displayName(node.name),
					meta: SKIPPED_REASON[reason],
				});
	}
	return out;
}

/**
 * The Language dropdown's options: the placeholder, then every stored language. The placeholder is
 * disabled while a language is applied (LS-34) — Revert is the way back, and picking "Choose a
 * language" did nothing.
 */
export function languageOptions(languages: readonly string[], applied: string | null): DropdownOption[] {
	return [
		{ value: '', label: LABELS.chooseLanguage, disabled: applied !== null },
		...languages.map((code) => ({ value: code, label: languageLabel(code) })),
	];
}
