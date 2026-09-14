// src/ui/rtl/copy.ts
//
// Every user-facing string the RTL Mirror panel renders, mirroring pseudo/copy.ts.
//
// Mostly transcribed from DES-2's state block rather than drafted (LS-11 §2.10). Two entries are
// amendments, and both follow a precedent LS-10 already set — see below.

export const LABELS = {
	mirror: 'Mirror',
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
