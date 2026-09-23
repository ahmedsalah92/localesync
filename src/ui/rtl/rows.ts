// src/ui/rtl/rows.ts
//
// The change summary as the flat list of rows the RTL panel renders (LS-28 §2.3).
//
// Pure, and apart from the panel, for the reason `selectShell` is: RtlPanel imports `../bridge`
// and cannot render under Vitest, so any decision left in its markup is one no test is watching.
import type { RowTone } from '../shell/ResultsRow';
import { UNNAMED_LAYER, groupCopy } from './copy';
import type { GroupKey, SummaryGroup } from './state';

export type RowTrailingModel =
	| { kind: 'none' }
	| { kind: 'expand'; key: GroupKey; expanded: boolean }
	| { kind: 'jump'; nodeId: string };

export interface SummaryRowModel {
	/** Unique across the list, so it doubles as the React key. Children are prefixed by their
	 *  group, because one node id can appear in two groups. */
	id: string;
	depth: 0 | 1;
	tone: RowTone;
	primary: string;
	meta: string;
	trailing: RowTrailingModel;
}

/** The strip carries meaning, not inherited chrome: neutral = done, amber = check, grey = not done. */
export function toneOf(group: SummaryGroup): RowTone {
	switch (group.kind) {
		case 'mirrored':
			return 'neutral';
		case 'moved':
			return 'truncates';
		case 'skipped':
			return 'unmeasurable';
	}
}

const displayName = (name: string | undefined): string =>
	name !== undefined && name.trim() !== '' ? name : UNNAMED_LAYER;

export function summaryRows(groups: readonly SummaryGroup[], expanded: readonly GroupKey[]): SummaryRowModel[] {
	const rows: SummaryRowModel[] = [];
	for (const group of groups) {
		const tone = toneOf(group);
		const { primary, meta } = groupCopy(group);
		if (group.kind === 'mirrored') {
			rows.push({ id: 'mirrored', depth: 0, tone, primary, meta, trailing: { kind: 'none' } });
			continue;
		}
		const open = expanded.includes(group.key);
		rows.push({
			id: group.key,
			depth: 0,
			tone,
			primary,
			meta,
			trailing: { kind: 'expand', key: group.key, expanded: open },
		});
		if (!open) continue;
		for (const node of group.nodes) {
			rows.push({
				id: `${group.key}:${node.nodeId}`,
				depth: 1,
				tone,
				primary: displayName(node.name),
				meta,
				trailing: { kind: 'jump', nodeId: node.nodeId },
			});
		}
	}
	return rows;
}
