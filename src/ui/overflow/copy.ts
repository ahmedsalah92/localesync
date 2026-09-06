// src/ui/overflow/copy.ts
//
// Every user-facing string the overflow panel renders, plus the menu data behind them. LS-8.2 owns
// the *format*; LS-14 owns the *words* and edits this one file (LS-8.2 §2.9).
import type { OverflowFilter, OverflowSort } from '../../common/overflow';
import type { OverflowReason, OverflowVerdict, OverflowVerdictValue } from '../../common/models';
import type { DropdownOption } from '../shell/primitives/Dropdown';
import type { RowMeta } from '../shell/ResultsRow';
import type { ScanScope } from '../../common/messages';

/**
 * Twelve selectable, five refused.
 *
 * Values are bare subtags and labels are English names with no regional tag: after normalisation
 * the canvas's `fr-FR` advertises a distinction the engine deliberately discards.
 *
 * The refused five are SHOWN, disabled, with their reason — hiding them would waste the sharpest
 * available statement of engine depth. The menu is not the enforcement, though:
 * `isUnsupportedLanguage` is, and it stays load-bearing because LS-12 can feed `ja` in from an
 * imported translation file (LS-8.2 §2.2).
 */
export const LANGUAGES: readonly DropdownOption[] = [
	{ value: 'de', label: 'German' },
	{ value: 'es', label: 'Spanish' },
	{ value: 'fi', label: 'Finnish' },
	{ value: 'nl', label: 'Dutch' },
	{ value: 'pl', label: 'Polish' },
	{ value: 'ru', label: 'Russian' },
	{ value: 'pt', label: 'Portuguese' },
	{ value: 'fr', label: 'French' },
	{ value: 'it', label: 'Italian' },
	{ value: 'he', label: 'Hebrew' },
	{ value: 'tr', label: 'Turkish' },
	{ value: 'ar', label: 'Arabic' },
	{ value: 'ja', label: 'Japanese', disabled: true, group: 'Not measurable yet — glyph width' },
	{ value: 'ko', label: 'Korean', disabled: true, group: 'Not measurable yet — glyph width' },
	{ value: 'zh-Hans', label: 'Chinese (Simplified)', disabled: true, group: 'Not measurable yet — glyph width' },
	{ value: 'zh-Hant', label: 'Chinese (Traditional)', disabled: true, group: 'Not measurable yet — glyph width' },
	{ value: 'th', label: 'Thai', disabled: true, group: 'Not measurable yet — glyph width' },
];

export const SCOPES: readonly { value: ScanScope; label: string }[] = [
	{ value: 'page', label: 'Page' },
	{ value: 'selection', label: 'Selection' },
];

/** `Clips` rather than `Truncates`: the variant name matches `OverflowVerdictValue`, the copy is
 *  better English. Settled, not drift — see VERDICT_WORD. */
export const FILTERS: readonly { value: OverflowFilter; label: string }[] = [
	{ value: 'issues', label: 'Issues' },
	{ value: 'all', label: 'All nodes' },
	{ value: 'overflows', label: 'Overflows' },
	{ value: 'truncates', label: 'Clips' },
	{ value: 'unmeasurable', label: 'Un-measurable' },
	{ value: 'fits', label: 'Fits' },
];

export const SORTS: readonly { value: OverflowSort; label: string }[] = [
	{ value: 'severity', label: 'Severity' },
	{ value: 'document', label: 'Document order' },
	{ value: 'container', label: 'Container' },
	{ value: 'amount', label: 'Overflow amount' },
];

export const LABELS = {
	language: 'Language',
	scope: 'Scope',
	show: 'Show',
	sort: 'Sort',
	scan: 'Scan',
	stop: 'Stop',
	jump: 'Zoom to node',
	tryAgain: 'Try Again',
	footer: 'Matrix',
} as const;

/**
 * The row's status word. The component set's variant reads `Severity=Truncates`, matching
 * `OverflowVerdictValue`; the text inside that variant reads `clips 8px`. The variant name is
 * implementer-facing and must match the union; the copy is better English. That divergence is
 * settled, not drift (LS-8.2 §2.6).
 */
export const VERDICT_WORD: Record<OverflowVerdictValue, string> = {
	fits: 'fits',
	truncates: 'clips',
	overflows: 'overflows',
	unmeasurable: 'un-measurable',
};

/** Explanations for un-measurable rows. Exhaustive so a new engine reason must make an explicit
 *  presentation choice here. LS-14 owns the final wording and edits this file. */
export const REASON_COPY: Record<OverflowReason, { word: string; tooltip: string } | null> = {
	'missing-font': {
		word: 'font missing',
		tooltip: "The font isn't installed, so Figma won't re-flow this text. Install it and scan again.",
	},
	'mixed-font-missing': {
		word: 'font missing',
		tooltip: "One of several fonts on this layer isn't installed.",
	},
	empty: {
		word: 'empty',
		tooltip: 'This layer has no text.',
	},
	'no-bounds': {
		word: 'no bounds',
		tooltip: 'This layer has no rendered box, so there is nothing to measure against.',
	},
	'unsupported-language': {
		word: 'not supported yet',
		tooltip: 'Overflow in this language depends on glyph width, which the engine does not model yet.',
	},
	'exceeds-fixed-box': null,
	'truncated-fixed-box': null,
	'maxLines-cap': null,
	'maxHeight-cap': null,
	'exceeds-container-height': null,
	'parent-escape': null,
	'no-container': null,
};

/**
 * The row's meta line, split into the part that may truncate and the part that must not.
 *
 * It used to return one concatenated `${containerLabel}  •  ${word}${amount}` string, which put the
 * verdict and the delta at the mercy of the container path: a deep path consumed the line and
 * ellipsed away the very number the row exists to report. `ResultsRow` lays the two out as separate
 * flex children (LS-8.2 §2.6); the bullet travels with the verdict so it is never left dangling at
 * a truncation boundary.
 *
 * The amount is ceiled at render, not on the wire: a 0.4px overshoot rounding to `overflows 0px`
 * would restate the very problem the delta exists to make visible, and `1px` is at least true.
 * Sorting uses the raw value (LS-8.2 §2.1).
 */
export function rowMeta(verdict: OverflowVerdict): RowMeta {
	const amount = verdict.overflowPx === undefined ? '' : ` ${Math.ceil(verdict.overflowPx)}px`;
	const reasonCopy =
		verdict.verdict === 'unmeasurable' && verdict.reason !== undefined ? REASON_COPY[verdict.reason] : null;
	const meta: RowMeta = {
		label: verdict.containerLabel,
		verdict: `•  ${reasonCopy?.word ?? VERDICT_WORD[verdict.verdict]}${amount}`,
	};
	if (reasonCopy !== null) meta.tooltip = reasonCopy.tooltip;
	return meta;
}

/** `shown of scanned` — true under every filter state, unlike `N issues` (design.md). */
export function summaryCount(shown: number, scanned: number): string {
	return `${shown.toLocaleString()} of ${scanned.toLocaleString()}`;
}

export function scanningCount(completed: number, total: number): string {
	return `Scanning… ${completed.toLocaleString()} of ${total.toLocaleString()} nodes`;
}

/**
 * The scanning band before the first progress tick carries a non-zero `total`.
 *
 * Traversal takes ~2s on a 485-node file, and for that whole window `scanningCount` had nothing but
 * zeroes to format — so the band read `Scanning… 0 of 0 nodes`, asserting an empty page while
 * claiming to scan it. No numbers until there are numbers (LS-8.2 §2.4).
 */
export const SCANNING_START = 'Scanning…';

export function foundYield(found: number): string {
	return `${found.toLocaleString()} found`;
}

export function stoppedCount(shown: number, scanned: number): string {
	return `Stopped — ${summaryCount(shown, scanned)}`;
}

/** Headline/body for each state the panel can surface. `StateView` holds no copy of its own
 *  (LS-5 §0), so every string it renders comes from here. */
export const STATES = {
	firstRun: {
		headline: 'Check for overflow',
		body: 'Pick a target language and scan the page to see which strings break their containers.',
	},
	noSelection: {
		headline: 'Nothing selected',
		body: 'Select at least one layer, or switch the scope to Page.',
	},
	noTextOnPage: {
		headline: 'No text to check',
		body: 'This scope has no eligible text layers.',
	},
	noIssues: (scanned: number) => ({
		headline: 'No issues found',
		body: `All ${scanned.toLocaleString()} nodes fit their containers.`,
	}),
	fontsUnavailable: {
		headline: 'Some fonts are unavailable',
		body: 'Those layers were skipped and flagged rather than measured — install the fonts and scan again.',
	},
	largeFile: {
		headline: 'This is a large file',
		body: 'The scan may take a while. Rows appear as they are found, and you can stop at any point.',
	},
	scanStopped: {
		headline: 'Scan stopped',
		body: 'Nothing had been checked yet. Scan again to start over.',
	},
	operationFailed: {
		headline: "That didn't work",
		body: 'Something went wrong. Try again.',
	},
} as const;
