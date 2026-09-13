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
 * When some layers were skipped it also carries the count — `Pseudo-loc: expansion 40% · 3 layers
 * skipped`. Confirmed as an amendment rather than transcribed copy: the panel has no summary bar,
 * so a partial skip otherwise has nowhere to live (`fonts-unavailable` only covers a *total* skip,
 * and a partial one just shows fewer rows than the user selected, silently). The count belongs on
 * a state affordance because it describes what is applied — this pseudo-loc covers 17 of 20 layers
 * — not merely what happened during one run.
 *
 * **The shape is a precedent, not a one-off.** `AppliedBanner` is LS-5's and shared by three
 * panels; LS-11 and LS-12 should follow `<what is applied> · <exception count>` rather than each
 * inventing a format.
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

/**
 * Counts **layers**, where the canvas said "N fonts could not be loaded".
 *
 * Two reasons, and the second is the better one. `BlockedNode` carries a reason, not a font name, so
 * a font count is not available at this layer and would overstate whenever two layers share a
 * missing font. More importantly, layers are what the user acts on — they go and fix the layers, and
 * the number of distinct fonts is trivia. Carrying the font name on `BlockedNode` would have bought
 * a less useful sentence at the cost of changing an LS-4 contract.
 */
export function fontsUnavailable(count: number): { headline: string; body: string } {
	const layers = count === 1 ? 'layer uses' : 'layers use';
	return {
		headline: 'Fonts unavailable',
		body: `${count} ${layers} fonts that couldn't be loaded — they're skipped and flagged, not expanded.`,
	};
}
