// src/ui/pseudo/copy.test.ts — the two strings LS-10 amended rather than transcribed.
//
// Mirrors src/ui/overflow/copy.test.ts. Most of this panel's copy comes straight off the canvas and
// needs no test; these two do, because each reads like a mistake unless you know the reason, and
// both would be easy to "correct" back.
import { describe, expect, it } from 'vitest';
import { ACCENTS, EXPANSIONS, MARKERS, appliedMessage, fontsUnavailable, skippedNote } from './copy';
import { DEFAULT_OPTIONS } from './state';

describe('fontsUnavailable — counts layers, not fonts (LS-10 §2.16)', () => {
	it('says layers, because BlockedNode carries a reason and not a font name', () => {
		// A font count is not derivable here and would overstate whenever two layers share one
		// missing font. Layers are also what the user goes and fixes.
		expect(fontsUnavailable(3).body).toBe(
			"3 layers use fonts that couldn't be loaded — they're skipped and flagged, not expanded.",
		);
		expect(fontsUnavailable(3).body).not.toContain('3 fonts');
	});

	it('agrees with itself in the singular', () => {
		expect(fontsUnavailable(1).body).toContain('1 layer uses');
	});
});

describe('appliedMessage — the banner carries a partial-skip count (LS-10 §2.17)', () => {
	it('names the applied ratio, not the accent or marker settings', () => {
		expect(appliedMessage(DEFAULT_OPTIONS.expansionPct)).toBe('Pseudo-loc: expansion 40%');
	});

	// The panel has no summary bar, and `fonts-unavailable` covers only a TOTAL skip — so without
	// this a partial skip silently shows fewer rows than the user selected.
	it('appends the count when some layers were skipped', () => {
		expect(appliedMessage(40, 3)).toBe('Pseudo-loc: expansion 40% · 3 layers skipped');
		expect(appliedMessage(40, 1)).toBe('Pseudo-loc: expansion 40% · 1 layer skipped');
	});

	it('stays clean when nothing was skipped, which is the common case', () => {
		expect(appliedMessage(50, 0)).toBe('Pseudo-loc: expansion 50%');
		expect(appliedMessage(50)).toBe('Pseudo-loc: expansion 50%');
	});

	// AppliedBanner is LS-5's and shared by three panels: LS-11 and LS-12 should follow
	// `<what is applied> · <exception count>` rather than each inventing a format.
	it('separates the count with the shared middot form', () => {
		expect(appliedMessage(40, 2)).toMatch(/^[^·]+ · \d+ layers? skipped$/);
		expect(skippedNote(2)).toBe('2 layers skipped');
	});
});

describe('the option sets match the canvas defaults', () => {
	it('offers three of each, with the built defaults present', () => {
		expect(EXPANSIONS.map((o) => o.label)).toEqual(['+30%', '+40%', '+50%']);
		expect(ACCENTS.map((o) => o.value)).toEqual(['none', 'partial', 'full']);
		expect(MARKERS.map((o) => o.value)).toEqual(['none', 'single', 'double']);
		expect(DEFAULT_OPTIONS).toEqual({ expansionPct: 40, accent: 'full', markers: 'double' });
	});
});
