// src/ui/rtl/copy.test.ts — the strings LS-11 amended rather than transcribed.
//
// Mirrors src/ui/pseudo/copy.test.ts. Most of this panel's copy comes off the canvas and needs no
// test; these do, because each reads like a mistake unless you know the reason, and all three would
// be easy to "correct" back toward the canvas text.
import { describe, expect, it } from 'vitest';
import type { BlockedNode, FlaggedNode } from '../../common/models';
import { BUSY, SKIPPED_REASON, STATES, UNNAMED_LAYER, appliedMessage, groupCopy } from './copy';
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

describe('STATES — transcribed from design.md', () => {
	/**
	 * `noSelection` was once omitted, because scope was implicit and its copy — "…or switch scope to
	 * Page" — named a control the panel did not have. Scope is explicit now (ruleset §7.3) and the
	 * panel has the select, so the state exists and its copy is the only one that may name it (LS-33).
	 */
	it('has the no-selection state, and only it names the scope control', () => {
		expect(Object.keys(STATES)).toEqual(['firstRun', 'noSelection', 'noText', 'operationFailed']);
		for (const [key, state] of Object.entries(STATES)) {
			if (key !== 'noSelection') expect(state.body).not.toMatch(/scope/i);
		}
	});

	it('promises the canvas is untouched after a failure — the LS-4 guarantee, in words', () => {
		expect(STATES.operationFailed.body).toContain('Nothing was left changed');
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
			'inside an instance — follows its main component',
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

// LS-30. The ellipsis is the single character, matching Overflow's `Scanning…` in the same band.
describe('BUSY — the in-flight band', () => {
	it('names the operation in flight', () => {
		expect(BUSY.applying).toBe('Applying mirror…');
		expect(BUSY.reverting).toBe('Reverting mirror…');
	});
});

describe('STATES.noSelection — transcribed from design.md (LS-33)', () => {
	it('names the scope control, which the panel now has', () => {
		expect(STATES.noSelection).toEqual({
			headline: 'Nothing selected',
			body: 'Select a frame or layer to mirror, or switch scope to Page.',
		});
	});
});
