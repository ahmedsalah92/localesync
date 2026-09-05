// src/common/overflow.ts
//
// Display ordering, filtering and sorting for overflow verdicts. Owned by LS-8 (LS-8.2 §1.3).
//
// This lives in `common`, not `src/main/overflow/`, because filtering and sorting run in the UI and
// `src/ui/tsconfig.json` references `../common` and nothing else — the panel physically cannot
// import from the main thread, and `npx tsc -b` fails on the attempt.
//
// Nor can the wire `severity` field serve as the display order: it is `'warn' | 'error' | undefined`,
// which ties `truncates` with `unmeasurable` and leaves `fits` undefined. It is not a total order.
// `severityFor` in src/main/overflow/verdict.ts stays exactly as it is — it produces the wire field,
// and never feeds row colour or row order.
//
// Pure and ambient-free (`types: []`), so both threads import it and Vitest runs it directly.
import type { OverflowVerdict, OverflowVerdictValue } from './models';

export type OverflowFilter = 'issues' | 'all' | 'overflows' | 'truncates' | 'unmeasurable' | 'fits';

export type OverflowSort = 'severity' | 'document' | 'container' | 'amount';

/**
 * Total order for display: overflows 3 > truncates 2 > unmeasurable 1 > fits 0.
 *
 * `unmeasurable` ranks above `fits` because a node that could not be checked is not a node that
 * passed. It ranks below `truncates` because a truncation is a confirmed layout consequence and an
 * unmeasurable node is an unknown.
 *
 * Exhaustive switch with no `default` — a fifth `OverflowVerdictValue` is a compile error here.
 */
export function severityRank(verdict: OverflowVerdictValue): number {
	switch (verdict) {
		case 'overflows':
			return 3;
		case 'truncates':
			return 2;
		case 'unmeasurable':
			return 1;
		case 'fits':
			return 0;
	}
}

/**
 * `'issues'` is every verdict except `fits`; `'all'` is everything; the rest match by name.
 *
 * Un-measurable rows belong under issues, and the empty state's claim "All 32 nodes fit their
 * containers" is only honest because they do (LS-8.2 §2.5).
 */
export function matchesFilter(verdict: OverflowVerdict, filter: OverflowFilter): boolean {
	switch (filter) {
		case 'all':
			return true;
		case 'issues':
			return verdict.verdict !== 'fits';
		default:
			return verdict.verdict === filter;
	}
}

/**
 * Filter, then sort. Returns a new array — never sorts in place, because the input is React state.
 *
 * Every mode breaks ties on document order (the array order as received from `scanOverflow`), which
 * is why each comparator falls through to the decorated index. Severity ties break on document
 * order and **not** on magnitude: folding magnitude into the severity sort would make two of the
 * four options nearly identical and leave no way to get a stable triage order (LS-8.2 §2.5).
 */
export function sortVerdicts(verdicts: readonly OverflowVerdict[], sort: OverflowSort): OverflowVerdict[] {
	const decorated = verdicts.map((verdict, index) => ({ verdict, index }));

	decorated.sort((a, b) => compare(a.verdict, b.verdict, sort) || a.index - b.index);

	return decorated.map((entry) => entry.verdict);
}

function compare(a: OverflowVerdict, b: OverflowVerdict, sort: OverflowSort): number {
	switch (sort) {
		case 'document':
			return 0; // array order as received; the index tiebreak IS the ordering
		case 'severity':
			return severityRank(b.verdict) - severityRank(a.verdict);
		case 'container':
			return a.containerLabel.localeCompare(b.containerLabel);
		case 'amount':
			return amountRank(b) - amountRank(a) || (b.overflowPx ?? 0) - (a.overflowPx ?? 0);
	}
}

// Three bands, descending: rows carrying a delta, then flagged rows without one, then unflagged.
// `maxHeight-cap` rows are flagged but carry no magnitude (the cap cannot be cleared off
// auto-layout, so the hidden amount is not knowable — LS-8.2 §2.1); they still sort above `fits`,
// because a flagged row sinking beneath passing rows in a magnitude sort reads as a bug.
function amountRank(verdict: OverflowVerdict): number {
	if (verdict.overflowPx !== undefined) return 2;
	return verdict.verdict === 'fits' ? 0 : 1;
}
