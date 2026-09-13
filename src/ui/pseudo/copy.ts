// src/ui/pseudo/copy.ts
//
// Every user-facing string the Pseudo-loc panel renders, mirroring extract/copy.ts.
//
// Unlike the other panels, none of this is provisional: DES-2 settled the pseudo-loc state copy on
// canvas (node `544:1429`), so LS-14 is implementation-only here and these strings are transcribed
// rather than drafted (LS-10 §2.14).
import type { AccentStyle, BoundaryMarker } from '../../common/models';

export const EXPANSIONS: readonly { value: string; label: string }[] = [
	{ value: '30', label: '+30%' },
	{ value: '40', label: '+40%' },
	{ value: '50', label: '+50%' },
];

export const ACCENTS: readonly { value: AccentStyle; label: string }[] = [
	{ value: 'none', label: 'No accents' },
	{ value: 'partial', label: 'Partial accents' },
	{ value: 'full', label: 'Full accents' },
];

export const MARKERS: readonly { value: BoundaryMarker; label: string }[] = [
	{ value: 'none', label: 'No markers' },
	{ value: 'single', label: '[ ]' },
	{ value: 'double', label: '[[ ]]' },
];

export const LABELS = {
	apply: 'Apply',
	tryAgain: 'Try Again',
	jump: 'Jump to node',
	// The three selects show bare values, so their meaning is positional. `Dropdown.ariaLabel`
	// carries the name a screen reader needs (LS-10 §2.4a).
	expansion: 'Expansion ratio',
	accent: 'Accent style',
	markers: 'Boundary markers',
} as const;

/**
 * The applied banner names the ratio, matching the canvas: `Pseudo-loc: expansion 40%`.
 *
 * When some layers were skipped it also carries the count. **This part is a copy amendment, not
 * transcribed** — the panel has no summary bar, so with a partial skip the design leaves the count
 * nowhere to live: `fonts-unavailable` only covers the case where *everything* was skipped, and a
 * partial skip just shows fewer rows than the user selected, silently. The banner is the one
 * persistent surface, so it carries it. Flagged for LS-14 in LS-10 §Carried forward.
 */
export function appliedMessage(expansionPct: number, skipped = 0): string {
	const base = `Pseudo-loc: expansion ${expansionPct}%`;
	return skipped === 0 ? base : `${base} · ${skippedNote(skipped)}`;
}

/** `N layers skipped` — a per-run count, not a state. */
export function skippedNote(count: number): string {
	const layers = count === 1 ? 'layer' : 'layers';
	return `${count} ${layers} skipped`;
}

/**
 * Transcribed from DES-2's state block. `fontsUnavailable` is the one count-bearing entry, and it
 * is a distinct *outcome* rather than a reworded missing-font message: the mutating panels skip and
 * flag those nodes, where the Overflow panel lists them as un-measurable (LS-24 Deliverable 5).
 */
export const STATES = {
	firstRun: {
		headline: 'Nothing to pseudo-localize yet',
		body: 'Select a frame or layer, then set an expansion ratio to preview how your layout holds up.',
	},
	noText: {
		headline: 'No text layers here',
		body: 'This page has nothing to pseudo-localize. Try another page.',
	},
	operationFailed: {
		headline: "Couldn't complete",
		body: 'The pseudo-loc transform failed and your canvas was restored. Nothing was left changed.',
	},
} as const;

export function fontsUnavailable(count: number): { headline: string; body: string } {
	const fonts = count === 1 ? 'font' : 'fonts';
	return {
		headline: 'Fonts unavailable',
		body: `${count} ${fonts} could not be loaded. Affected strings will be skipped and flagged, not expanded.`,
	};
}
