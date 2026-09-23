// src/ui/rtl/copy.test.ts — the strings LS-11 amended rather than transcribed.
//
// Mirrors src/ui/pseudo/copy.test.ts. Most of this panel's copy comes off the canvas and needs no
// test; these do, because each reads like a mistake unless you know the reason, and all three would
// be easy to "correct" back toward the canvas text.
import { describe, expect, it } from 'vitest';
import type { BlockedNode, FlaggedNode } from '../../common/models';
import {
	FLAG_REASON,
	SKIPPED_REASON,
	STATES,
	UNNAMED_LAYER,
	appliedMessage,
	fontsUnavailable,
	groupCopy,
} from './copy';
import { SKIPPED_ORDER, type SummaryGroup } from './state';

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
		expect(Object.keys(STATES)).toEqual(['firstRun', 'noText', 'operationFailed', 'nothingToReview']);
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

describe('groupCopy — the change summary’s rows (LS-28 §2.2)', () => {
	const flagged = (n: number): FlaggedNode[] =>
		Array.from({ length: n }, (_, i) => ({ nodeId: String(i), name: 'icon', reason: 'moved-vector' }));
	const skipped = (reason: BlockedNode['reason'], n: number): BlockedNode[] =>
		Array.from({ length: n }, (_, i) => ({ nodeId: String(i), reason }));

	it.each([
		[{ kind: 'mirrored', count: 12 }, '12 layers mirrored', 'layout flipped right-to-left'],
		[{ kind: 'mirrored', count: 1 }, '1 layer mirrored', 'layout flipped right-to-left'],
		// Review Focus 5: plural at zero.
		[{ kind: 'mirrored', count: 0 }, '0 layers mirrored', 'layout flipped right-to-left'],
		[{ kind: 'moved', key: 'moved', nodes: flagged(3) }, '3 icons moved', 'check direction'],
		[{ kind: 'moved', key: 'moved', nodes: flagged(1) }, '1 icon moved', 'check direction'],
		[
			{
				kind: 'skipped',
				key: 'skipped:instance-locked',
				reason: 'instance-locked',
				nodes: skipped('instance-locked', 2),
			},
			'2 layers skipped',
			'inside a component instance',
		],
		[
			{ kind: 'skipped', key: 'skipped:missing-font', reason: 'missing-font', nodes: skipped('missing-font', 1) },
			'1 layer skipped',
			'font unavailable',
		],
		[
			{
				kind: 'skipped',
				key: 'skipped:already-mutated',
				reason: 'already-mutated',
				nodes: skipped('already-mutated', 2),
			},
			'2 layers skipped',
			'Preview or Pseudo-loc is active',
		],
		[
			{ kind: 'skipped', key: 'skipped:empty', reason: 'empty', nodes: skipped('empty', 1) },
			'1 layer skipped',
			'empty layer',
		],
	] as [SummaryGroup, string, string][])('%o → %s', (group, primary, meta) => {
		expect(groupCopy(group)).toEqual({ primary, meta });
	});

	// Says "layers", never "frames": `succeeded` counts every layer written, not only containers.
	it('never calls the mirrored count frames', () => {
		expect(groupCopy({ kind: 'mirrored', count: 12 }).primary).not.toMatch(/frame/i);
	});

	it('has a reason line for every skip reason the panel can show', () => {
		for (const reason of SKIPPED_ORDER) expect(SKIPPED_REASON[reason]).toMatch(/\S/);
	});

	it('names the fallback for a layer with no name', () => {
		expect(UNNAMED_LAYER).toBe('Unnamed layer');
	});
});
