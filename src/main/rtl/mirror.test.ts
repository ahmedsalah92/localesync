// src/main/rtl/mirror.test.ts — pure unit tests (no `figma`, no DOM).
//
// Every case derives from `docs/rtl-mirroring-ruleset.md` (F1–F10) and `docs/specs/LS-11.md` §3.1.
import { describe, expect, it } from 'vitest';
import { mirrorColumn, mirrorX, movedByParent, planMirror, shouldFlagMoved } from './mirror';
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

	// Columns are reflected for the whole grid at once — see the regression block at the bottom.
	const grid = (children: { childId: string; row: number; column: number; span: number }[], count = 3) =>
		node({ layoutMode: 'GRID', gridColumnCount: count, gridChildren: children });

	it('reflects every child of a grid in one write', () => {
		const writes = planMirror(
			grid([
				{ childId: 'a', row: 0, column: 0, span: 1 },
				{ childId: 'b', row: 0, column: 2, span: 1 },
			]),
		);
		expect(find(writes, 'grid-reposition').moves).toEqual([
			{ childId: 'a', row: 0, column: 2 },
			{ childId: 'b', row: 0, column: 0 },
		]);
	});

	// A spanning child must land on its LEFTMOST column after the reflection, not its rightmost.
	it('accounts for a column span', () => {
		expect(mirrorColumn(0, 2, 3)).toBe(1);
		expect(mirrorColumn(1, 2, 4)).toBe(1);
		expect(find(planMirror(grid([{ childId: 'a', row: 0, column: 0, span: 2 }])), 'grid-reposition').moves).toEqual(
			[{ childId: 'a', row: 0, column: 1 }],
		);
	});

	it('never changes a row', () => {
		const moves = find(
			planMirror(
				grid([
					{ childId: 'a', row: 0, column: 0, span: 1 },
					{ childId: 'b', row: 1, column: 1, span: 1 },
				]),
			),
			'grid-reposition',
		).moves;
		expect(moves.map((move) => move.row)).toEqual([0, 1]);
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
/**
 * The defect the LS-11 harness caught on its first two real runs against the fixture. Both were the
 * same mistake in different clothes: treating a grid position as a per-child property.
 *
 * 1. `gridColumnAnchorIndex` and `gridColumnCount` exist on EVERY auto-layout node, so reading them
 *    off a non-grid produced junk — a HORIZONTAL frame reports 1 column while its children report
 *    their child index, giving `1 - 2 - 1 = -2` and a rejected write.
 * 2. Even on a real grid, writing the reflection one child at a time collides: a reversal swaps
 *    occupied cells and `setGridChildPosition` rejects a TRANSIENT overlap.
 *
 * The rule now belongs to the grid, exactly like child order, and the writes are staged.
 */
describe('F9 belongs to the grid, not to its children (regression)', () => {
	it('emits nothing for a child of a HORIZONTAL frame', () => {
		expect(
			kinds(planMirror(node({ parentLayoutMode: 'HORIZONTAL', gridChildHorizontalAlign: 'MIN' }))),
		).not.toContain('grid-align');
	});

	it.each(['NONE', 'HORIZONTAL', 'VERTICAL', undefined] as const)(
		'emits no reposition when the node is a %s frame',
		(mode) => {
			expect(
				kinds(
					planMirror(
						node({
							layoutMode: mode,
							gridColumnCount: 3,
							gridChildren: [{ childId: 'a', row: 0, column: 0, span: 1 }],
						}),
					),
				),
			).not.toContain('grid-reposition');
		},
	);

	it('emits ONE write for the whole grid, never one per child', () => {
		const writes = planMirror(
			node({
				layoutMode: 'GRID',
				gridColumnCount: 3,
				gridChildren: [
					{ childId: 'a', row: 0, column: 0, span: 1 },
					{ childId: 'b', row: 0, column: 1, span: 1 },
					{ childId: 'c', row: 0, column: 2, span: 1 },
				],
			}),
		);
		expect(writes.filter((write) => write.kind === 'grid-reposition')).toHaveLength(1);
	});

	it('never emits a negative column', () => {
		for (let count = 1; count <= 4; count += 1) {
			for (let column = 0; column < 6; column += 1) {
				const writes = planMirror(
					node({
						layoutMode: 'GRID',
						gridColumnCount: count,
						gridChildren: [{ childId: 'a', row: 0, column, span: 1 }],
					}),
				);
				const write = writes.find((w) => w.kind === 'grid-reposition');
				if (write !== undefined && write.kind === 'grid-reposition') {
					for (const move of write.moves) expect(move.column).toBeGreaterThanOrEqual(0);
				}
			}
		}
	});
});

/**
 * A GROUP is not a layout box. Its position and size are DERIVED from its children, so mirroring
 * the children already moves the group — and writing the group's own `x` on top moves the same
 * content twice. It is also non-involutive: the second pass reads a box the first pass moved,
 * which is how the harness caught it (`mirror-twice-identity:FAIL plain-group: x: 16 → 128`).
 */
describe('a GROUP is mirrored through its children, never repositioned itself (regression)', () => {
	it('emits no x write for a group', () => {
		expect(
			kinds(planMirror(node({ isGroup: true, parentLayoutMode: 'NONE', x: 16, width: 208, parentWidth: 320 }))),
		).not.toContain('x');
	});

	it('still writes x for an ordinary frame in the same position', () => {
		expect(find(planMirror(node({ parentLayoutMode: 'NONE', x: 16, width: 208, parentWidth: 320 })), 'x').x).toBe(
			96,
		);
	});

	// The children do the mirroring — reflected about the group's own bounds.
	it('still mirrors a child OF a group', () => {
		expect(find(planMirror(node({ parentLayoutMode: 'NONE', x: 0, width: 24, parentWidth: 208 })), 'x').x).toBe(
			184,
		);
	});
});

/**
 * G1 says "moved under F1 or F7". F7 is the child's own `x` write; these are the moves its PARENT
 * causes. Before LS-28 only F7 was detected, so an icon reordered inside an auto-layout row — the
 * "Next ›" chevron, the commonest directional icon — was moved and never flagged.
 */
describe('movedByParent — G1 for parent-driven moves (F1, F9)', () => {
	const flow = (...ids: string[]) => ids.map((id) => ({ id, absolute: false }));
	const row = (childCount: number) => node({ layoutMode: 'HORIZONTAL', childCount });

	it('F1: a reversed row of three moves both ends, never the middle', () => {
		expect(movedByParent(row(3), planMirror(row(3)), flow('a', 'b', 'c'))).toEqual(['a', 'c']);
	});

	it('F1: a reversed row of four moves every child', () => {
		expect(movedByParent(row(4), planMirror(row(4)), flow('a', 'b', 'c', 'd'))).toEqual(['a', 'b', 'c', 'd']);
	});

	// An absolute child is not placed by the flow, so reversing the array does not move it — its own
	// F7 write does, and is detected there. It also does not count toward the middle.
	it('F1: skips absolute children, and finds the middle among flow children only', () => {
		const children = [...flow('a'), { id: 'abs', absolute: true }, ...flow('b', 'c')];
		expect(movedByParent(row(4), planMirror(row(4)), children)).toEqual(['a', 'c']);
	});

	it('moves nothing when the plan does not reverse (vertical, instance, single child)', () => {
		const vertical = node({ layoutMode: 'VERTICAL', childCount: 3 });
		expect(movedByParent(vertical, planMirror(vertical), flow('a', 'b', 'c'))).toEqual([]);
		const instance = node({ layoutMode: 'HORIZONTAL', childCount: 3, isInstance: true });
		expect(movedByParent(instance, planMirror(instance), flow('a', 'b', 'c'))).toEqual([]);
	});

	it('F9: a grid child moves when its column changes, and only then', () => {
		const grid = node({
			layoutMode: 'GRID',
			gridColumnCount: 3,
			gridChildren: [
				{ childId: 'left', row: 0, column: 0, span: 1 },
				{ childId: 'centre', row: 0, column: 1, span: 1 },
				{ childId: 'right', row: 0, column: 2, span: 1 },
			],
		});
		expect(movedByParent(grid, planMirror(grid), [])).toEqual(['left', 'right']);
	});
});
