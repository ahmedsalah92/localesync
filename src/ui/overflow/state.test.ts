// src/ui/overflow/state.test.ts — pure unit tests (no `figma`, no DOM).
//
// The reducer is deliberately free of React and of `./bridge` so this file runs under Vitest's
// plain Node environment (agent-guidelines §6: no jsdom). Importing OverflowPanel.tsx here would
// pull in the bridge, which assigns a `window` listener at module scope.
import { describe, expect, it } from 'vitest';
import { foundCount, initialOverflowState, overflowReducer, visibleVerdicts, type OverflowState } from './state';
import type { OverflowVerdict, OverflowVerdictValue } from '../../common/models';

function row(nodeId: string, verdict: OverflowVerdictValue, overflowPx?: number): OverflowVerdict {
	const value: OverflowVerdict = {
		nodeId,
		language: 'de',
		verdict,
		characters: nodeId,
		containerLabel: 'home / header',
		candidate: nodeId,
		measuredWidth: 100,
		measuredHeight: 20,
	};
	if (overflowPx !== undefined) value.overflowPx = overflowPx;
	return value;
}

/** Apply a sequence of actions to a fresh state. */
function run(...actions: Parameters<typeof overflowReducer>[1][]): OverflowState {
	return actions.reduce(overflowReducer, initialOverflowState());
}

const ids = (verdicts: readonly OverflowVerdict[]): string[] => verdicts.map((v) => v.nodeId);

describe('overflowReducer — lifecycle', () => {
	it('starts idle, with German as the default target', () => {
		const state = initialOverflowState();
		expect(state.phase).toBe('idle');
		// Not the canvas's French: fr carries 0.95, the second-lowest factor in the table — the
		// weakest possible first run. German is 1.15, the canonical expansion case (LS-8.2 §2.2).
		expect(state.language).toBe('de');
		expect(state.scope).toBe('page');
		expect(state.filter).toBe('issues');
		expect(state.sort).toBe('severity');
	});

	it('idle → scanning → done', () => {
		const scanning = run({ kind: 'scan-started' });
		expect(scanning.phase).toBe('scanning');
		const done = overflowReducer(scanning, { kind: 'result', verdicts: [row('a', 'overflows')], stopped: false });
		expect(done.phase).toBe('done');
		expect(ids(done.verdicts)).toEqual(['a']);
	});

	it('scanning → stopped via a result carrying stopped: true', () => {
		const state = run({ kind: 'scan-started' }, { kind: 'result', verdicts: [row('a', 'fits')], stopped: true });
		expect(state.phase).toBe('stopped');
		// A stop keeps its rows — the user pressed Stop, they did not discard work.
		expect(ids(state.verdicts)).toEqual(['a']);
	});

	it('scanning → failed', () => {
		const state = run({ kind: 'scan-started' }, { kind: 'failed', code: 'internal' });
		expect(state.phase).toBe('failed');
		expect(state.errorCode).toBe('internal');
	});

	it('a new scan clears the previous run', () => {
		const state = run(
			{ kind: 'scan-started' },
			{ kind: 'result', verdicts: [row('old', 'overflows')], stopped: false },
			{ kind: 'select', nodeId: 'old' },
			{ kind: 'scan-started' },
		);
		expect(state.verdicts).toEqual([]);
		expect(state.completed).toBe(0);
		expect(state.total).toBe(0);
		expect(state.selectedNodeId).toBeNull();
		expect(state.errorCode).toBeNull();
	});
});

describe('overflowReducer — streaming', () => {
	it('partials accumulate in arrival order', () => {
		const state = run(
			{ kind: 'scan-started' },
			{ kind: 'partial', verdicts: [row('a', 'overflows'), row('b', 'fits')] },
			{ kind: 'partial', verdicts: [row('c', 'truncates')] },
		);
		expect(ids(state.verdicts)).toEqual(['a', 'b', 'c']);
	});

	it('the final result replaces rather than appends, so a streamed row is not duplicated', () => {
		const streamed = row('a', 'overflows');
		const state = run(
			{ kind: 'scan-started' },
			{ kind: 'partial', verdicts: [streamed] },
			// The result carries the complete set, including everything already streamed.
			{ kind: 'result', verdicts: [streamed, row('b', 'fits')], stopped: false },
		);
		expect(ids(state.verdicts)).toEqual(['a', 'b']);
	});

	it('ignores progress and partials outside the scanning phase', () => {
		const done = run({ kind: 'scan-started' }, { kind: 'result', verdicts: [row('a', 'fits')], stopped: false });
		const late = overflowReducer(done, { kind: 'partial', verdicts: [row('ghost', 'overflows')] });
		expect(ids(late.verdicts)).toEqual(['a']);
		const tick = overflowReducer(done, { kind: 'progress', completed: 99, total: 99 });
		expect(tick.completed).toBe(0);
	});

	it('progress updates the count while scanning', () => {
		const state = run({ kind: 'scan-started' }, { kind: 'progress', completed: 25, total: 120 });
		expect(state.completed).toBe(25);
		expect(state.total).toBe(120);
	});

	it('the result leaves completed/total alone — the engine final tick is what makes them exact', () => {
		const state = run(
			{ kind: 'scan-started' },
			{ kind: 'progress', completed: 30, total: 30 },
			{ kind: 'result', verdicts: [row('a', 'fits'), row('b', 'fits')], stopped: false },
		);
		expect(state.completed).toBe(30);
		expect(state.total).toBe(30);
	});
});

describe('visibleVerdicts', () => {
	it('applies filter then sort', () => {
		const base = run(
			{ kind: 'scan-started' },
			{
				kind: 'result',
				stopped: false,
				verdicts: [row('fits-row', 'fits'), row('clip', 'truncates'), row('over', 'overflows')],
			},
		);
		// Default filter `issues` drops `fits`; default sort `severity` puts overflows first.
		expect(ids(visibleVerdicts(base))).toEqual(['over', 'clip']);

		const all = overflowReducer(base, { kind: 'set-filter', filter: 'all' });
		expect(ids(visibleVerdicts(all))).toEqual(['over', 'clip', 'fits-row']);

		const byDocument = overflowReducer(all, { kind: 'set-sort', sort: 'document' });
		expect(ids(visibleVerdicts(byDocument))).toEqual(['fits-row', 'clip', 'over']);
	});

	it('never mutates state.verdicts', () => {
		const state = run(
			{ kind: 'scan-started' },
			{
				kind: 'result',
				stopped: false,
				verdicts: [row('a', 'fits'), row('b', 'overflows', 4), row('c', 'truncates')],
			},
		);
		const before = ids(state.verdicts);
		void visibleVerdicts(overflowReducer(state, { kind: 'set-sort', sort: 'amount' }));
		void visibleVerdicts(state);
		expect(ids(state.verdicts)).toEqual(before);
	});
});

describe('foundCount', () => {
	it('equals the accumulated non-fits count', () => {
		const state = run(
			{ kind: 'scan-started' },
			{ kind: 'partial', verdicts: [row('a', 'overflows'), row('b', 'fits')] },
			{ kind: 'partial', verdicts: [row('c', 'truncates'), row('d', 'unmeasurable'), row('e', 'fits')] },
		);
		expect(state.verdicts).toHaveLength(5);
		expect(foundCount(state)).toBe(3);
	});

	it('is unaffected by the display filter — it is a scan yield, not a row count', () => {
		const state = run(
			{ kind: 'scan-started' },
			{ kind: 'partial', verdicts: [row('a', 'overflows'), row('b', 'truncates')] },
			{ kind: 'set-filter', filter: 'overflows' },
		);
		expect(visibleVerdicts(state)).toHaveLength(1);
		expect(foundCount(state)).toBe(2);
	});
});
