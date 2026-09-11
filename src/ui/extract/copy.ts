// src/ui/extract/copy.ts
//
// Every user-facing string the Extract panel renders, mirroring overflow/copy.ts. LS-9 owns the
// *format*; LS-14 owns the *words* and edits this one file. The drift wording is provisional until
// DES-2's band revision (LS-9 §2.27).
import type { ScanScope } from '../../common/messages';
import type { ExtractedString } from '../../common/models';
import type { RowMeta } from '../shell/ResultsRow';

export const SCOPES: readonly { value: ScanScope; label: string }[] = [
	{ value: 'page', label: 'Page' },
	{ value: 'selection', label: 'Selection' },
];

export const LABELS = {
	scope: 'Scope',
	scan: 'Scan',
	jump: 'Zoom to node',
	tryAgain: 'Try Again',
	footer: 'Report', // LS-13 paid-intent stub — preserved, not a placeholder (LS-9 §1.4)
} as const;

/**
 * The row's meta line: the key, and — only when the string is duplicated — the `N×` marker.
 *
 * The same total on every member of a group, with no ordinal: an ordinal implies an order the user
 * cannot see. The dedup survivor is not marked, because dedup defaults off (LS-9 §2.26).
 */
export function rowMeta(entry: ExtractedString, occurrences: number): RowMeta {
	if (occurrences < 2) return { label: entry.key };
	return {
		label: entry.key,
		verdict: `${occurrences}×`,
		tooltip: `The same text appears in ${occurrences} layers. Each keeps its own key; export can merge them.`,
	};
}

/** `12 strings extracted`, plus the drift count beside it when there is one (LS-9 §2.27). */
export function summaryCount(strings: number, drifted: number): string {
	const count = `${strings.toLocaleString()} ${strings === 1 ? 'string' : 'strings'} extracted`;
	return drifted === 0 ? count : `${count} · ${drifted.toLocaleString()} renamed since keyed`;
}

export function scanningCount(completed: number, total: number): string {
	return `Scanning… ${completed.toLocaleString()} of ${total.toLocaleString()} nodes`;
}

/** Before the first progress tick carries a non-zero `total`: no numbers until there are numbers. */
export const SCANNING_START = 'Scanning…';

/** Headline/body for each state the panel can surface. `StateView` holds no copy of its own. */
export const STATES = {
	// design.md, LS-9 empty state. The "Run Scan" hint now has a control to point at.
	firstRun: {
		headline: 'No strings extracted',
		body: 'Run Scan to extract translatable strings.',
	},
	noSelection: {
		headline: 'Nothing selected',
		body: 'Select at least one layer, or switch the scope to Page.',
	},
	noText: {
		headline: 'No text to extract',
		body: 'This scope has no visible text layers.',
	},
	operationFailed: {
		headline: "That didn't work",
		body: 'Something went wrong. Try again.',
	},
} as const;
