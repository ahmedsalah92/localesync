// src/ui/rtl/rows.test.ts — the change summary as the rows the panel renders (LS-28 §2.3). Pure.
import { describe, expect, it } from 'vitest';
import type { SummaryGroup } from './state';
import { summaryRows, toneOf } from './rows';

const groups: SummaryGroup[] = [
	{ kind: 'mirrored', count: 12 },
	{ kind: 'moved', key: 'moved', nodes: [{ nodeId: '1', name: 'chevron', reason: 'moved-vector' }] },
	{
		kind: 'skipped',
		key: 'skipped:instance-locked',
		reason: 'instance-locked',
		nodes: [
			{ nodeId: '7', reason: 'instance-locked', name: 'Label' },
			{ nodeId: '8', reason: 'instance-locked' },
			{ nodeId: '9', reason: 'instance-locked', name: '   ' },
		],
	},
];

describe('toneOf — the strip carries meaning (LS-28 §2.3)', () => {
	it('neutral for done, amber for check, grey for not done', () => {
		expect(groups.map(toneOf)).toEqual(['neutral', 'truncates', 'unmeasurable']);
	});
});

describe('summaryRows', () => {
	it('renders the mirrored row with no trailing affordance', () => {
		expect(summaryRows(groups, [])[0]).toEqual({
			id: 'mirrored',
			depth: 0,
			tone: 'neutral',
			primary: '12 layers mirrored',
			meta: 'layout flipped right-to-left',
			trailing: { kind: 'none' },
		});
	});

	it('collapsed groups render only their header', () => {
		const rows = summaryRows(groups, []);
		expect(rows.map((r) => r.id)).toEqual(['mirrored', 'moved', 'skipped:instance-locked']);
		expect(rows[1]?.trailing).toEqual({ kind: 'expand', key: 'moved', expanded: false });
	});

	it('an open group renders its children, indented and jumpable, directly under it', () => {
		const rows = summaryRows(groups, ['moved']);
		expect(rows.map((r) => r.id)).toEqual(['mirrored', 'moved', 'moved:1', 'skipped:instance-locked']);
		expect(rows[1]?.trailing).toEqual({ kind: 'expand', key: 'moved', expanded: true });
		expect(rows[2]).toEqual({
			id: 'moved:1',
			depth: 1,
			tone: 'truncates',
			primary: 'chevron',
			meta: 'check direction',
			trailing: { kind: 'jump', nodeId: '1' },
		});
	});

	// Review Focus 1: absent, empty or whitespace names never render as a blank line.
	it('falls back to Unnamed layer for a missing or blank name', () => {
		const rows = summaryRows(groups, ['skipped:instance-locked']);
		expect(rows.filter((r) => r.depth === 1).map((r) => r.primary)).toEqual([
			'Label',
			'Unnamed layer',
			'Unnamed layer',
		]);
	});

	// Review Focus 4: the same nodeId in two groups must not collide as a React key.
	it('keeps row ids unique when a node id repeats across groups', () => {
		const dup: SummaryGroup[] = [
			{ kind: 'mirrored', count: 1 },
			{ kind: 'moved', key: 'moved', nodes: [{ nodeId: '5', name: 'a', reason: 'moved-vector' }] },
			{ kind: 'skipped', key: 'skipped:empty', reason: 'empty', nodes: [{ nodeId: '5', reason: 'empty' }] },
		];
		const ids = summaryRows(dup, ['moved', 'skipped:empty']).map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('is empty when there are no groups', () => {
		expect(summaryRows([], ['moved'])).toEqual([]);
	});
});
