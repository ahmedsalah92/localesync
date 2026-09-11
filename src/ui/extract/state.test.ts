// src/ui/extract/state.test.ts — pure unit tests (no `figma`, no DOM).
//
// The reducer is deliberately free of React and of `./bridge` so this file runs under Vitest's
// plain Node environment (agent-guidelines §6: no jsdom).
import { describe, expect, it } from 'vitest';
import { rowMeta, summaryCount } from './copy';
import { driftedCount, extractReducer, initialExtractState, occurrenceCounts, type ExtractState } from './state';
import type { ExtractedString } from '../../common/models';

function entry(nodeId: string, value: string, drifted = false): ExtractedString {
	return { key: `home.${nodeId}`, nodeId, value, drifted };
}

function run(...actions: Parameters<typeof extractReducer>[1][]): ExtractState {
	return actions.reduce(extractReducer, initialExtractState());
}

describe('extractReducer — lifecycle', () => {
	it('starts idle on page scope with nothing extracted', () => {
		const state = initialExtractState();
		expect(state.phase).toBe('idle');
		expect(state.scope).toBe('page');
		expect(state.entries).toEqual([]);
		expect(state.selectedNodeId).toBeNull();
		expect(state.errorCode).toBeNull();
	});

	it('idle → scanning → done, keeping document order', () => {
		const scanning = run({ kind: 'scan-started' });
		expect(scanning.phase).toBe('scanning');
		const done = extractReducer(scanning, {
			kind: 'result',
			entries: [entry('b', 'B'), entry('a', 'A')],
			blocked: [],
		});
		expect(done.phase).toBe('done');
		expect(done.entries.map((e) => e.nodeId)).toEqual(['b', 'a']);
	});

	it('an empty result is done, not failed (rule 25)', () => {
		const state = run({ kind: 'scan-started' }, { kind: 'result', entries: [], blocked: [] });
		expect(state.phase).toBe('done');
		expect(state.errorCode).toBeNull();
	});

	it('scanning → failed carries the code', () => {
		const state = run({ kind: 'scan-started' }, { kind: 'failed', code: 'no-selection' });
		expect(state.phase).toBe('failed');
		expect(state.errorCode).toBe('no-selection');
	});

	it('a new scan clears the previous run', () => {
		const state = run(
			{ kind: 'scan-started' },
			{ kind: 'progress', completed: 3, total: 3 },
			{ kind: 'result', entries: [entry('a', 'A')], blocked: [] },
			{ kind: 'select', nodeId: 'a' },
			{ kind: 'failed', code: 'node-gone' },
			{ kind: 'scan-started' },
		);
		expect(state.entries).toEqual([]);
		expect(state.completed).toBe(0);
		expect(state.total).toBe(0);
		expect(state.selectedNodeId).toBeNull();
		expect(state.errorCode).toBeNull();
	});

	it('blocked from the result reaches state intact, and the next scan clears it', () => {
		const blocked = [{ nodeId: 'I4:5;6:7', reason: 'instance-locked' as const }];
		const done = run({ kind: 'scan-started' }, { kind: 'result', entries: [entry('a', 'A')], blocked });
		expect(done.blocked).toEqual(blocked);
		expect(done.blocked).not.toBe(blocked);
		expect(extractReducer(done, { kind: 'scan-started' }).blocked).toEqual([]);
		expect(initialExtractState().blocked).toEqual([]);
	});

	it('set-scope and select update their fields', () => {
		const state = run({ kind: 'set-scope', scope: 'selection' }, { kind: 'select', nodeId: 'x' });
		expect(state.scope).toBe('selection');
		expect(state.selectedNodeId).toBe('x');
	});

	it('does not copy the result array by reference', () => {
		const entries = [entry('a', 'A')];
		const state = run({ kind: 'scan-started' }, { kind: 'result', entries, blocked: [] });
		entries.push(entry('b', 'B'));
		expect(state.entries).toHaveLength(1);
	});
});

describe('extractReducer — progress', () => {
	it('updates the count while scanning', () => {
		const state = run({ kind: 'scan-started' }, { kind: 'progress', completed: 25, total: 120 });
		expect(state.completed).toBe(25);
		expect(state.total).toBe(120);
	});

	it('ignores progress outside the scanning phase', () => {
		const done = run({ kind: 'scan-started' }, { kind: 'result', entries: [], blocked: [] });
		expect(extractReducer(done, { kind: 'progress', completed: 9, total: 9 })).toBe(done);
		expect(extractReducer(initialExtractState(), { kind: 'progress', completed: 9, total: 9 }).total).toBe(0);
	});
});

describe('occurrenceCounts', () => {
	it('groups by exact value and keys by nodeId', () => {
		const counts = occurrenceCounts([
			entry('a', 'Save'),
			entry('b', 'Cancel'),
			entry('c', 'Save'),
			entry('d', 'Save'),
		]);
		expect(Object.fromEntries(counts)).toEqual({ a: 3, b: 1, c: 3, d: 3 });
	});

	it('is exact — case and whitespace distinguish values', () => {
		const counts = occurrenceCounts([entry('a', 'Save'), entry('b', 'save'), entry('c', 'Save ')]);
		expect([...counts.values()]).toEqual([1, 1, 1]);
	});

	it('the duplicate-value fixture pair reads 2 on both nodes (§3.3)', () => {
		const counts = occurrenceCounts([entry('a', 'Save'), entry('b', 'Save')]);
		expect(counts.get('a')).toBe(2);
		expect(counts.get('b')).toBe(2);
	});

	it('is empty for no entries', () => {
		expect(occurrenceCounts([]).size).toBe(0);
	});
});

describe('driftedCount', () => {
	it('counts drifted entries', () => {
		expect(driftedCount([entry('a', 'A', true), entry('b', 'B'), entry('c', 'C', true)])).toBe(2);
		expect(driftedCount([])).toBe(0);
	});
});

describe('copy', () => {
	it('marks only duplicated strings, with the group total and no ordinal', () => {
		expect(rowMeta(entry('a', 'Save'), 1)).toEqual({ label: 'home.a' });
		const marked = rowMeta(entry('a', 'Save'), 3);
		expect(marked.label).toBe('home.a');
		expect(marked.verdict).toBe('3×');
		expect(marked.tooltip).toBeDefined();
	});

	it('states the drift count only when there is drift', () => {
		expect(summaryCount(1, 0)).toBe('1 string extracted');
		expect(summaryCount(12, 0)).toBe('12 strings extracted');
		expect(summaryCount(12, 2)).toMatch(/^12 strings extracted · 2 /);
	});
});
