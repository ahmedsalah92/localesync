// src/common/overflow.test.ts — pure unit tests (no `figma`, no DOM).
import { describe, expect, it } from 'vitest';
import { matchesFilter, severityRank, sortVerdicts, type OverflowFilter, type OverflowSort } from './overflow';
import type { OverflowVerdict, OverflowVerdictValue } from './models';

const VERDICTS: readonly OverflowVerdictValue[] = ['overflows', 'truncates', 'unmeasurable', 'fits'];

/** Minimal verdict. `nodeId` doubles as the document-order label so tie-breaks are readable. */
function row(
	nodeId: string,
	verdict: OverflowVerdictValue,
	extra: Partial<OverflowVerdict> = {},
): OverflowVerdict {
	return {
		nodeId,
		language: 'de',
		verdict,
		characters: nodeId,
		containerLabel: 'home / header',
		candidate: nodeId,
		measuredWidth: 100,
		measuredHeight: 20,
		...extra,
	};
}

const ids = (verdicts: readonly OverflowVerdict[]): string[] => verdicts.map((v) => v.nodeId);

describe('severityRank', () => {
	it('is a strict total order over every OverflowVerdictValue', () => {
		const ranks = VERDICTS.map(severityRank);
		// Distinct — no two verdicts share a rank, which is what `severity` on the wire fails to do.
		expect(new Set(ranks).size).toBe(VERDICTS.length);
		// Descending in the LS-8.2 §1.3 order: overflows 3 > truncates 2 > unmeasurable 1 > fits 0.
		expect(ranks).toEqual([3, 2, 1, 0]);
	});
});

describe('matchesFilter', () => {
	// All six filters x all four verdicts = 24 assertions (LS-8.2 §3.1).
	const expected: Record<OverflowFilter, readonly OverflowVerdictValue[]> = {
		issues: ['overflows', 'truncates', 'unmeasurable'],
		all: ['overflows', 'truncates', 'unmeasurable', 'fits'],
		overflows: ['overflows'],
		truncates: ['truncates'],
		unmeasurable: ['unmeasurable'],
		fits: ['fits'],
	};

	const cases = (Object.keys(expected) as OverflowFilter[]).flatMap((filter) =>
		VERDICTS.map((verdict) => [filter, verdict, expected[filter].includes(verdict)] as const),
	);

	it.each(cases)('filter %s admits %s → %s', (filter, verdict, admitted) => {
		expect(matchesFilter(row('n', verdict), filter)).toBe(admitted);
	});

	it('issues admits exactly overflows, truncates and unmeasurable', () => {
		const admitted = VERDICTS.filter((v) => matchesFilter(row('n', v), 'issues'));
		expect(admitted).toEqual(['overflows', 'truncates', 'unmeasurable']);
	});
});

describe('sortVerdicts', () => {
	it('severity orders overflows → truncates → unmeasurable → fits', () => {
		const input = [row('a', 'fits'), row('b', 'unmeasurable'), row('c', 'overflows'), row('d', 'truncates')];
		expect(ids(sortVerdicts(input, 'severity'))).toEqual(['c', 'd', 'b', 'a']);
	});

	it('document keeps the array order as received from scanOverflow', () => {
		const input = [row('a', 'fits'), row('b', 'overflows'), row('c', 'truncates')];
		expect(ids(sortVerdicts(input, 'document'))).toEqual(['a', 'b', 'c']);
	});

	it('container sorts by containerLabel ascending', () => {
		const input = [
			row('a', 'overflows', { containerLabel: 'settings / body' }),
			row('b', 'overflows', { containerLabel: 'checkout / summary' }),
			row('c', 'overflows', { containerLabel: 'home / header' }),
		];
		expect(ids(sortVerdicts(input, 'container'))).toEqual(['b', 'c', 'a']);
	});

	it('amount sorts by overflowPx descending', () => {
		const input = [
			row('a', 'overflows', { overflowPx: 8 }),
			row('b', 'overflows', { overflowPx: 96 }),
			row('c', 'overflows', { overflowPx: 22 }),
		];
		expect(ids(sortVerdicts(input, 'amount'))).toEqual(['b', 'c', 'a']);
	});

	it('amount places a maxHeight-cap row above every fits row and below every row with a delta', () => {
		// A flagged row carrying no magnitude still outranks passing rows — a flagged row sinking
		// beneath `fits` in a magnitude sort reads as a bug (LS-8.2 §2.5).
		const input = [
			row('fits-row', 'fits'),
			row('capped', 'truncates', { reason: 'maxHeight-cap' }), // no overflowPx by contract
			row('delta', 'overflows', { overflowPx: 1 }),
		];
		expect(ids(sortVerdicts(input, 'amount'))).toEqual(['delta', 'capped', 'fits-row']);
	});

	// Every mode breaks ties on document order — severity ties on magnitude would collapse two of
	// the four sort options into near-duplicates (LS-8.2 §2.5).
	const tieCases: readonly OverflowSort[] = ['severity', 'document', 'container', 'amount'];
	it.each(tieCases)('%s breaks ties on document order', (sort) => {
		const input = [
			row('first', 'overflows', { overflowPx: 10 }),
			row('second', 'overflows', { overflowPx: 10 }),
			row('third', 'overflows', { overflowPx: 10 }),
		];
		expect(ids(sortVerdicts(input, sort))).toEqual(['first', 'second', 'third']);
	});

	it('severity ties break on document order, not on magnitude', () => {
		const input = [row('small', 'overflows', { overflowPx: 2 }), row('huge', 'overflows', { overflowPx: 900 })];
		expect(ids(sortVerdicts(input, 'severity'))).toEqual(['small', 'huge']);
	});

	it.each(tieCases)('%s does not mutate the input array', (sort) => {
		const input = [row('a', 'fits'), row('b', 'overflows', { overflowPx: 4 }), row('c', 'truncates')];
		const before = ids(input);
		const sorted = sortVerdicts(input, sort);
		expect(ids(input)).toEqual(before);
		expect(sorted).not.toBe(input);
	});
});
