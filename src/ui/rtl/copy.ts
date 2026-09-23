// src/ui/rtl/copy.ts
//
// Every user-facing string the RTL Mirror panel renders, mirroring pseudo/copy.ts.
//
// Mostly transcribed from DES-2's state block rather than drafted (LS-11 §2.10). Two entries are
// amendments, and both follow a precedent LS-10 already set — see below.
import type { ScanScope } from '../../common/messages';
import type { SkippedReason, SummaryGroup } from './state';

/** Same two values, same labels, same order as Extract's — it is the shared Scope Select pattern
 *  (design.md LS-24 Deliverable 4), not a second one. */
export const SCOPES: readonly { value: ScanScope; label: string }[] = [
	{ value: 'page', label: 'Page' },
	{ value: 'selection', label: 'Selection' },
];

export const LABELS = {
	mirror: 'Mirror',
	scope: 'Scope',
	tryAgain: 'Try Again',
	jump: 'Jump to node',
} as const;

/**
 * The applied banner, matching the canvas: `RTL mirror applied`.
 *
 * When the mirror moved nodes it could not rotate, it carries the review count —
 * `RTL mirror applied · 3 to check`. This follows the `<what is applied> · <exception count>` shape
 * LS-10 §2.17 established for `AppliedBanner`, which is shared by three panels; inventing a second
 * format here is exactly what that precedent exists to prevent.
 */
export function appliedMessage(toCheck = 0): string {
	return toCheck === 0 ? 'RTL mirror applied' : `RTL mirror applied · ${toCheck} to check`;
}

/**
 * Transcribed from DES-2's state block, with one omission and one correction.
 *
 * **`no-selection` is absent, deliberately.** The canvas copy reads "…or switch scope to Page", but
 * scope is implicit here — selection when non-empty, else page (`docs/rtl-mirroring-ruleset.md`
 * §7.3) — so `resolveScope` downgrades and the panel can never reach that state. Same resolution as
 * LS-10 §2.4; shipping copy that names a control the panel does not have would be worse than
 * omitting the state.
 */
export const STATES = {
	firstRun: {
		headline: 'Nothing to mirror yet',
		body: 'Select a frame or layer, then apply the mirror to stress-test your layout in RTL.',
	},
	noText: {
		headline: 'No layers to mirror here',
		body: 'This page has nothing to mirror. Try another page.',
	},
	operationFailed: {
		headline: "Couldn't complete",
		body: 'The mirror failed and your canvas was restored. Nothing was left changed.',
	},
	/**
	 * **Amendment, not transcribed.** DES-2's state table has no RTL cell for "applied, nothing to
	 * review", but the panel reaches it whenever a mirror succeeds and flags nothing — which is the
	 * good case and should be the common one.
	 *
	 * Without it the panel falls back to `firstRun` and tells the user there is "Nothing to mirror
	 * yet" while the banner directly above says the mirror IS applied. Two contradictory claims about
	 * the same canvas is worse than an untranscribed string.
	 */
	nothingToReview: {
		headline: 'Mirror applied',
		body: 'Nothing needs a direction check. Look at the canvas to see how your layout holds up in RTL.',
	},
} as const;

/**
 * Counts **layers**, where the canvas said "N fonts could not be loaded".
 *
 * The same correction LS-10 §2.16 made, for the same reason: `BlockedNode` carries a reason, not a
 * font name, so a font count is not derivable at this layer and would overstate whenever two layers
 * share one missing font. Layers are also what the user goes and fixes.
 */
export function fontsUnavailable(count: number): { headline: string; body: string } {
	const layers = count === 1 ? 'layer uses' : 'layers use';
	return {
		headline: 'Fonts unavailable',
		body: `${count} ${layers} fonts that couldn't be loaded — they're skipped and flagged, not mirrored.`,
	};
}

/** The review row's explanation. The mirror moved it; only a human can say whether it should also
 *  have been rotated (G1). */
export const FLAG_REASON: Record<'moved-vector', string> = {
	'moved-vector': 'moved — check direction',
};

/** A child row's name when the node reported none, or an empty one (LS-28 §2.2). */
export const UNNAMED_LAYER = 'Unnamed layer';

/**
 * Why a layer was skipped, in the user's terms (LS-28 §2.2). A `Record` over every reason, so
 * adding a `BlockReason` the mirror can hit fails `tsc` until it has copy.
 */
export const SKIPPED_REASON: Record<SkippedReason, string> = {
	'instance-locked': 'inside a component instance',
	'missing-font': 'font unavailable',
	'already-mutated': 'Preview or Pseudo-loc is active',
	empty: 'empty layer',
};

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * A summary group's two lines.
 *
 * "Layers", not the issue sketch's "frames": `succeeded` counts every layer the mirror wrote —
 * containers, their direct children and text (F6) — so "frames" would overstate it. "Icons" is the
 * user's word for `FLAGGABLE_TYPES`, the leaf vector types.
 */
export function groupCopy(group: SummaryGroup): { primary: string; meta: string } {
	switch (group.kind) {
		case 'mirrored':
			return {
				primary: count(group.count, 'layer mirrored', 'layers mirrored'),
				meta: 'layout flipped right-to-left',
			};
		case 'moved':
			return { primary: count(group.nodes.length, 'icon moved', 'icons moved'), meta: 'check direction' };
		case 'skipped':
			return {
				primary: count(group.nodes.length, 'layer skipped', 'layers skipped'),
				meta: SKIPPED_REASON[group.reason],
			};
	}
}
