// src/ui/rtl/copy.test.ts — the strings LS-11 amended rather than transcribed.
//
// Mirrors src/ui/pseudo/copy.test.ts. Most of this panel's copy comes off the canvas and needs no
// test; these do, because each reads like a mistake unless you know the reason, and all three would
// be easy to "correct" back toward the canvas text.
import { describe, expect, it } from 'vitest';
import { FLAG_REASON, STATES, appliedMessage, fontsUnavailable } from './copy';

describe('appliedMessage — the banner carries the review count (LS-11 §2.9)', () => {
	it('stays clean when there is nothing to review, which is the good case', () => {
		expect(appliedMessage()).toBe('RTL mirror applied');
		expect(appliedMessage(0)).toBe('RTL mirror applied');
	});

	it('appends the count when the mirror moved nodes it could not rotate', () => {
		expect(appliedMessage(3)).toBe('RTL mirror applied · 3 to check');
	});

	// AppliedBanner is LS-5's and shared by three panels. LS-10 §2.17 set `<what is applied> ·
	// <exception count>` as the precedent precisely so this panel would not invent a second format.
	it('uses the shared middot form', () => {
		expect(appliedMessage(2)).toMatch(/^[^·]+ · \d+ to check$/);
	});
});

describe('fontsUnavailable — counts layers, not fonts', () => {
	// The same correction LS-10 §2.16 made: BlockedNode carries a reason, not a font name, so a font
	// count is not derivable here and would overstate whenever two layers share one missing font.
	it('says layers, and never a font count', () => {
		expect(fontsUnavailable(3).body).toContain('3 layers use');
		expect(fontsUnavailable(3).body).not.toContain('3 fonts');
		expect(fontsUnavailable(3).body).toContain('not mirrored');
	});

	it('agrees with itself in the singular', () => {
		expect(fontsUnavailable(1).body).toContain('1 layer uses');
	});
});

describe('STATES — transcribed, with one deliberate omission', () => {
	/**
	 * DES-2's canvas copy for this panel's no-selection state reads "…or switch scope to Page", but
	 * scope is implicit here and `resolveScope` downgrades to page, so the panel can never reach that
	 * state. Shipping copy naming a control the panel does not have would be worse than omitting it —
	 * the same resolution as LS-10 §2.4.
	 */
	it('has no no-selection state, and names no scope control anywhere', () => {
		expect(Object.keys(STATES)).toEqual(['firstRun', 'noText', 'operationFailed']);
		for (const state of Object.values(STATES)) {
			expect(state.body).not.toMatch(/scope/i);
		}
	});

	it('promises the canvas is untouched after a failure — the LS-4 guarantee, in words', () => {
		expect(STATES.operationFailed.body).toContain('Nothing was left changed');
	});
});

describe('FLAG_REASON — says what the user must do, not what the plugin did', () => {
	it('asks for a direction check rather than reporting a move', () => {
		expect(FLAG_REASON['moved-vector']).toBe('moved — check direction');
	});
});
