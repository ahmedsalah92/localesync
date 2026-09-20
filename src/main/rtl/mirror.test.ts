// src/main/rtl/mirror.test.ts — pure unit tests (no `figma`, no DOM).
//
// Every case derives from `docs/rtl-mirroring-ruleset.md` (F1–F10) and `docs/specs/LS-11.md` §3.1.
import { describe, expect, it } from 'vitest';
import { mirrorColumn, mirrorX, planMirror, shouldFlagMoved } from './mirror';
import type { MirrorInput, MirrorWrite } from './mirror';

const node = (overrides: Partial<MirrorInput> = {}): MirrorInput => ({ nodeId: 'n:1', ...overrides });
const kinds = (writes: MirrorWrite[]): MirrorWrite['kind'][] => writes.map((w) => w.kind);
const find = <K extends MirrorWrite['kind']>(writes: MirrorWrite[], kind: K): Extract<MirrorWrite, { kind: K }> =>
	writes.find((w) => w.kind === kind) as Extract<MirrorWrite, { kind: K }>;

describe('F3/F4 — flip whichever axis is horizontal for THIS frame, never both', () => {
	// The ruleset's named easy-to-get-wrong case: the horizontal axis is `primary` in a horizontal
	// frame and `counter` in a vertical one. Flipping both vertically reorders columns.
	it('flips primary on a horizontal frame and leaves counter alone', () => {
		const writes = planMirror(
			node({ layoutMode: 'HORIZONTAL', primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MIN' }),
		);
		expect(find(writes, 'primary-align').value).toBe('MAX');
		expect(kinds(writes)).not.toContain('counter-align');
	});

	it('flips counter on a vertical frame and leaves primary alone', () => {
		const writes = planMirror(
			node({ layoutMode: 'VERTICAL', primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MAX' }),
		);
		expect(find(writes, 'counter-align').value).toBe('MIN');
		expect(kinds(writes)).not.toContain('primary-align');
	});

	it.each(['CENTER', 'SPACE_BETWEEN'] as const)('leaves primary %s untouched — horizontally neutral', (value) => {
		expect(kinds(planMirror(node({ layoutMode: 'HORIZONTAL', primaryAxisAlignItems: value })))).not.toContain(
			'primary-align',
		);
	});

	it.each(['CENTER', 'BASELINE'] as const)('leaves counter %s untouched — horizontally neutral', (value) => {
		expect(kinds(planMirror(node({ layoutMode: 'VERTICAL', counterAxisAlignItems: value })))).not.toContain(
			'counter-align',
		);
	});
});

describe('F1/F2 — child order and the paint order it drags with it', () => {
	it('reverses children of a horizontal frame and toggles the z-index flag', () => {
		const writes = planMirror(node({ layoutMode: 'HORIZONTAL', childCount: 3, itemReverseZIndex: false }));
		expect(kinds(writes)).toContain('reverse-children');
		expect(find(writes, 'item-reverse-z').value).toBe(true);
	});

	// Reversing the children array reverses paint order too, so the flag must move with it or
	// overlapping children (avatar stacks, chips) silently re-stack.
	it('toggles the flag back when it was already set', () => {
		const writes = planMirror(node({ layoutMode: 'HORIZONTAL', childCount: 2, itemReverseZIndex: true }));
		expect(find(writes, 'item-reverse-z').value).toBe(false);
	});

	it('does not reverse a vertical frame', () => {
		expect(kinds(planMirror(node({ layoutMode: 'VERTICAL', childCount: 3 })))).not.toContain('reverse-children');
	});

	it('does not reverse a single child — nothing to reorder', () => {
		expect(kinds(planMirror(node({ layoutMode: 'HORIZONTAL', childCount: 1 })))).not.toContain('reverse-children');
	});

	// Instance children cannot be reparented, so F1 is impossible here (LS-11 §2.5). The instance
	// still mirrors its own padding and alignment.
	it('never reverses inside an instance, but still mirrors its own padding', () => {
		const writes = planMirror(
			node({ layoutMode: 'HORIZONTAL', childCount: 4, isInstance: true, paddingLeft: 16, paddingRight: 4 }),
		);
		expect(kinds(writes)).not.toContain('reverse-children');
		expect(find(writes, 'padding')).toEqual({ kind: 'padding', left: 4, right: 16 });
	});
});

describe('F5 — padding', () => {
	it('swaps an asymmetric inset', () => {
		expect(find(planMirror(node({ paddingLeft: 16, paddingRight: 8 })), 'padding')).toEqual({
			kind: 'padding',
			left: 8,
			right: 16,
		});
	});

	it('emits nothing for a symmetric inset — its own mirror', () => {
		expect(kinds(planMirror(node({ paddingLeft: 12, paddingRight: 12 })))).not.toContain('padding');
	});
});

describe('F7 — position, and who owns it', () => {
	it('reflects an absolutely-positioned child about the parent width', () => {
		const writes = planMirror(
			node({ layoutPositioning: 'ABSOLUTE', parentLayoutMode: 'HORIZONTAL', x: 10, width: 30, parentWidth: 100 }),
		);
		expect(find(writes, 'x').x).toBe(60);
	});

	it('reflects a child of a non-auto-layout parent', () => {
		expect(find(planMirror(node({ parentLayoutMode: 'NONE', x: 0, width: 40, parentWidth: 200 })), 'x').x).toBe(
			160,
		);
	});

	// An auto-layout child's x is derived by the parent; writing it back would fight the reflow.
	// This is also why F1 and F7 act on disjoint sets, which is what makes recursion order free.
	it('never writes x for a node the parent lays out', () => {
		expect(
			kinds(
				planMirror(
					node({
						layoutPositioning: 'AUTO',
						parentLayoutMode: 'HORIZONTAL',
						x: 5,
						width: 10,
						parentWidth: 100,
					}),
				),
			),
		).not.toContain('x');
	});

	// A child wider than its parent is exactly the overflow a stress test exists to surface.
	it('does not clamp a negative result', () => {
		expect(mirrorX(10, 150, 100)).toBe(-60);
	});
});

describe('F8 / F9 / F10 — constraints and grid', () => {
	it.each([
		['MIN', 'MAX'],
		['MAX', 'MIN'],
	] as const)('flips the %s horizontal constraint to %s', (from, to) => {
		expect(find(planMirror(node({ constraintHorizontal: from })), 'constraint-horizontal').value).toBe(to);
	});

	it.each(['CENTER', 'STRETCH', 'SCALE'] as const)('leaves the %s constraint untouched', (value) => {
		expect(kinds(planMirror(node({ constraintHorizontal: value })))).not.toContain('constraint-horizontal');
	});

	// The grid rules need a GRID parent — see the regression block at the bottom of this file.
	it('reflects a single-column child', () => {
		expect(
			find(
				planMirror(node({ parentLayoutMode: 'GRID', gridColumnAnchorIndex: 0, parentGridColumnCount: 3 })),
				'grid-column',
			).column,
		).toBe(2);
	});

	// A spanning child must land on its leftmost column after the reflection, not its rightmost.
	it('accounts for a column span', () => {
		expect(mirrorColumn(0, 2, 3)).toBe(1);
		expect(mirrorColumn(1, 2, 4)).toBe(1);
	});

	it('flips grid child alignment but not AUTO or CENTER', () => {
		expect(
			find(planMirror(node({ parentLayoutMode: 'GRID', gridChildHorizontalAlign: 'MIN' })), 'grid-align').value,
		).toBe('MAX');
		expect(kinds(planMirror(node({ parentLayoutMode: 'GRID', gridChildHorizontalAlign: 'AUTO' })))).not.toContain(
			'grid-align',
		);
	});
});

describe('F6 — text alignment', () => {
	it.each([
		['LEFT', 'RIGHT'],
		['RIGHT', 'LEFT'],
	] as const)('flips %s to %s', (from, to) => {
		expect(find(planMirror(node({ textAlignHorizontal: from })), 'text-align').value).toBe(to);
	});

	it.each(['CENTER', 'JUSTIFIED'] as const)('leaves %s untouched', (value) => {
		expect(kinds(planMirror(node({ textAlignHorizontal: value })))).not.toContain('text-align');
	});
});

/**
 * The property that makes the mirror safe to re-apply and makes recursion order free (LS-11 §2.3).
 * If any rule ever stops being its own inverse, revert stops being reliable — so this is asserted
 * over every case rather than spot-checked.
 */
describe('every rule is an involution — mirroring twice is the identity', () => {
	const CASES: MirrorInput[] = [
		node({ layoutMode: 'HORIZONTAL', primaryAxisAlignItems: 'MIN', childCount: 3, itemReverseZIndex: false }),
		node({ layoutMode: 'VERTICAL', counterAxisAlignItems: 'MAX' }),
		node({ paddingLeft: 16, paddingRight: 8 }),
		node({ parentLayoutMode: 'NONE', x: 10, width: 30, parentWidth: 100 }),
		node({ layoutPositioning: 'ABSOLUTE', parentLayoutMode: 'GRID', x: 4, width: 8, parentWidth: 64 }),
		node({ constraintHorizontal: 'MIN' }),
		node({ parentLayoutMode: 'GRID', gridColumnAnchorIndex: 0, gridColumnSpan: 2, parentGridColumnCount: 4 }),
		node({ parentLayoutMode: 'GRID', gridChildHorizontalAlign: 'MAX' }),
		node({ textAlignHorizontal: 'LEFT' }),
	];

	/** Fold the plan back onto the input, so the second pass sees a genuinely mirrored node. */
	function applyToInput(input: MirrorInput, writes: MirrorWrite[]): MirrorInput {
		const next: MirrorInput = { ...input };
		for (const write of writes) {
			switch (write.kind) {
				case 'primary-align':
					next.primaryAxisAlignItems = write.value;
					break;
				case 'counter-align':
					next.counterAxisAlignItems = write.value;
					break;
				case 'padding':
					next.paddingLeft = write.left;
					next.paddingRight = write.right;
					break;
				case 'x':
					next.x = write.x;
					break;
				case 'constraint-horizontal':
					next.constraintHorizontal = write.value;
					break;
				case 'grid-column':
					next.gridColumnAnchorIndex = write.column;
					break;
				case 'grid-align':
					next.gridChildHorizontalAlign = write.value;
					break;
				case 'text-align':
					next.textAlignHorizontal = write.value;
					break;
				case 'item-reverse-z':
					next.itemReverseZIndex = write.value;
					break;
				case 'reverse-children':
					break; // order lives outside MirrorInput; reversing twice is trivially identity
			}
		}
		return next;
	}

	it.each(CASES.map((c, i) => [i, c]))('case %i round-trips', (_i, input) => {
		const once = applyToInput(input, planMirror(input));
		const twice = applyToInput(once, planMirror(once));
		expect(twice).toEqual(input);
	});
});

describe('shouldFlagMoved — G1', () => {
	it('flags a moved vector, because the plugin cannot rotate what it depicts', () => {
		expect(shouldFlagMoved('VECTOR', true)).toBe(true);
	});

	it('does not flag a vector that did not move', () => {
		expect(shouldFlagMoved('VECTOR', false)).toBe(false);
	});

	// A frame that moves is layout, not artwork — flagging it would bury the real findings.
	it('does not flag a moved frame or text node', () => {
		expect(shouldFlagMoved('FRAME', true)).toBe(false);
		expect(shouldFlagMoved('TEXT', true)).toBe(false);
	});
});

/**
 * The defect the LS-11 harness caught on its first real run against a fixture.
 *
 * `gridColumnAnchorIndex` and `gridColumnCount` exist on EVERY auto-layout node, not only grid ones,
 * and off a grid their values are junk: a HORIZONTAL frame reports a column count of 1 while its
 * children report their ordinary child index. Reflecting that produces a negative column, and
 * `setGridChildPosition` rejects it — which failed the apply AND then failed the rollback, leaving
 * the canvas half-mirrored.
 *
 * Gating on the PARENT's layout mode is the only correct test. Property existence is not one.
 */
describe('F9 applies only inside a real grid (regression)', () => {
	it('emits no grid write for a child of a HORIZONTAL frame', () => {
		const writes = planMirror(
			node({ parentLayoutMode: 'HORIZONTAL', parentGridColumnCount: 1, gridColumnAnchorIndex: 2 }),
		);
		expect(kinds(writes)).not.toContain('grid-column');
	});

	it.each(['NONE', 'VERTICAL', undefined] as const)('emits no grid write when the parent is %s', (mode) => {
		expect(
			kinds(planMirror(node({ parentLayoutMode: mode, parentGridColumnCount: 1, gridColumnAnchorIndex: 2 }))),
		).not.toContain('grid-column');
	});

	it('still mirrors columns when the parent really is a GRID', () => {
		const writes = planMirror(
			node({ parentLayoutMode: 'GRID', parentGridColumnCount: 3, gridColumnAnchorIndex: 0, gridColumnSpan: 2 }),
		);
		expect(find(writes, 'grid-column').column).toBe(1);
	});

	// The exact arithmetic that threw: child index 2 of a frame claiming 1 column.
	it('never emits a negative column', () => {
		for (const count of [1, 2, 3, 4]) {
			for (let anchor = 0; anchor < 6; anchor += 1) {
				const writes = planMirror(
					node({ parentLayoutMode: 'GRID', parentGridColumnCount: count, gridColumnAnchorIndex: anchor }),
				);
				const write = writes.find((w) => w.kind === 'grid-column');
				if (write !== undefined && write.kind === 'grid-column') expect(write.column).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it('gates grid alignment on the same test', () => {
		expect(
			kinds(planMirror(node({ parentLayoutMode: 'HORIZONTAL', gridChildHorizontalAlign: 'MIN' }))),
		).not.toContain('grid-align');
		expect(kinds(planMirror(node({ parentLayoutMode: 'GRID', gridChildHorizontalAlign: 'MIN' })))).toContain(
			'grid-align',
		);
	});
});
