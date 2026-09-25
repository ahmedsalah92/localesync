// src/main/rtl/mirror.ts — the pure mirroring rules. No `figma` access, no bridge import, so the
// whole ruleset is unit-testable without a plugin runtime (agent-guidelines §6).
//
// The authority for WHAT flips is `docs/rtl-mirroring-ruleset.md` (RTL-1 / LS-20); rules are cited
// as F1–F10 and never restated here. This module is the translation of those rules into a list of
// property writes, and nothing else — it decides, the caller applies.
//
// **Every rule is an involution.** Applying the plan twice must return the original: `MIN`↔`MAX` is
// its own inverse, reversing a reversed array restores it, and the position rule is a reflection.
// `mirror.test.ts` asserts that over every case, because it is the property that makes the mirror
// safe to re-apply and cheap to reason about (LS-11 §2.3).

/** Everything a rule needs, read off a live node by the caller. Optional fields mean the property
 *  does not exist on this node — never "unknown". */
export interface MirrorInput {
	nodeId: string;

	// ── as a parent ──
	layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
	primaryAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
	counterAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE';
	paddingLeft?: number;
	paddingRight?: number;
	itemReverseZIndex?: boolean;
	childCount?: number;
	/** Children of an instance cannot be reparented, so F1 is impossible inside one (LS-11 §2.5). */
	isInstance?: boolean;
	/** A GROUP has no layout of its own and its box is derived from its children (ruleset §7.4). */
	isGroup?: boolean;

	// ── as a child of its own parent ──
	parentLayoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
	parentWidth?: number;
	layoutPositioning?: 'AUTO' | 'ABSOLUTE';
	x?: number;
	width?: number;
	constraintHorizontal?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE';
	gridChildHorizontalAlign?: 'MIN' | 'CENTER' | 'MAX' | 'AUTO';

	/**
	 * This node's own grid children, when it IS a grid (F9).
	 *
	 * Columns are reflected for the whole grid at once, not per child: `setGridChildPosition` throws
	 * on a transient overlap, so a reversal written one child at a time collides on its first write.
	 * The rule therefore belongs to the parent, exactly like child order.
	 */
	gridColumnCount?: number;
	gridChildren?: { childId: string; row: number; column: number; span: number }[];

	// ── text ──
	textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
}

export type MirrorWrite =
	| { readonly kind: 'reverse-children' }
	| { readonly kind: 'item-reverse-z'; readonly value: boolean }
	| { readonly kind: 'primary-align'; readonly value: 'MIN' | 'MAX' }
	| { readonly kind: 'counter-align'; readonly value: 'MIN' | 'MAX' }
	| { readonly kind: 'padding'; readonly left: number; readonly right: number }
	| { readonly kind: 'x'; readonly x: number }
	| { readonly kind: 'constraint-horizontal'; readonly value: 'MIN' | 'MAX' }
	| {
			readonly kind: 'grid-reposition';
			readonly moves: readonly { childId: string; row: number; column: number }[];
	  }
	| { readonly kind: 'grid-align'; readonly value: 'MIN' | 'MAX' }
	| { readonly kind: 'text-align'; readonly value: 'LEFT' | 'RIGHT' };

/** `MIN`↔`MAX`; every other value is horizontally neutral and passes through untouched. */
function flipEnd<T extends string>(value: T): T | 'MIN' | 'MAX' {
	if (value === 'MIN') return 'MAX';
	if (value === 'MAX') return 'MIN';
	return value;
}

const isEnd = (value: string | undefined): value is 'MIN' | 'MAX' => value === 'MIN' || value === 'MAX';

/**
 * F7's reflection: `x' = parentWidth − x − width`.
 *
 * Deliberately unclamped. A child wider than its parent produces a negative `x`, which is legal in
 * Figma and is exactly the overflow a stress test exists to surface — clamping would hide it.
 */
export function mirrorX(x: number, width: number, parentWidth: number): number {
	return parentWidth - x - width;
}

/** F9's reflection over columns, accounting for a child that spans more than one. */
export function mirrorColumn(column: number, span: number, columnCount: number): number {
	return columnCount - column - span;
}

/**
 * `x` is authored only when the parent does not lay this node out — it opted out with `ABSOLUTE`
 * positioning, or the parent has no auto-layout. For an auto-layout child `x` is derived, and
 * writing it would fight the next reflow (LS-11 §2.3, and why F1 and F7 act on disjoint sets).
 */
export function isPositionedByParent(input: MirrorInput): boolean {
	if (input.layoutPositioning === 'ABSOLUTE') return false;
	return input.parentLayoutMode !== undefined && input.parentLayoutMode !== 'NONE';
}

/** The ruleset applied to one node. Order within the list does not matter — the writes are
 *  independent — except that the caller applies `reverse-children` last (see `applyMirror`). */
export function planMirror(input: MirrorInput): MirrorWrite[] {
	const writes: MirrorWrite[] = [];

	// F1 + F2 — reversing the children array mirrors the flow AND the paint order, so the z-index
	// flag is toggled to keep the original stacking. One rule, two writes.
	const horizontal = input.layoutMode === 'HORIZONTAL';
	if (horizontal && input.isInstance !== true && (input.childCount ?? 0) > 1) {
		writes.push({ kind: 'reverse-children' });
		if (input.itemReverseZIndex !== undefined) {
			writes.push({ kind: 'item-reverse-z', value: !input.itemReverseZIndex });
		}
	}

	// F3 / F4 — flip whichever axis is the horizontal one for THIS frame, never both.
	if (horizontal && isEnd(input.primaryAxisAlignItems)) {
		writes.push({ kind: 'primary-align', value: flipEnd(input.primaryAxisAlignItems) });
	}
	if (input.layoutMode === 'VERTICAL' && isEnd(input.counterAxisAlignItems)) {
		writes.push({ kind: 'counter-align', value: flipEnd(input.counterAxisAlignItems) });
	}

	// F5 — a symmetric inset is its own mirror; emitting it would be a no-op write.
	if (
		input.paddingLeft !== undefined &&
		input.paddingRight !== undefined &&
		input.paddingLeft !== input.paddingRight
	) {
		writes.push({ kind: 'padding', left: input.paddingRight, right: input.paddingLeft });
	}

	// F7 — but never on a GROUP.
	//
	// A group is not a layout box: its position and size are DERIVED from wherever its children
	// happen to be. Its children are mirrored about its own bounds, which reverses them in place —
	// and then writing the group's `x` on top would move that same content a second time. It also
	// makes the rule non-involutive, because the second pass reads a box the first pass moved.
	if (
		input.isGroup !== true &&
		!isPositionedByParent(input) &&
		input.x !== undefined &&
		input.width !== undefined &&
		input.parentWidth !== undefined
	) {
		writes.push({ kind: 'x', x: mirrorX(input.x, input.width, input.parentWidth) });
	}

	// F8
	if (isEnd(input.constraintHorizontal)) {
		writes.push({ kind: 'constraint-horizontal', value: flipEnd(input.constraintHorizontal) });
	}

	// F9 — the whole grid at once, emitted on the GRID itself rather than on its children.
	//
	// The columns are reflected together because they must be WRITTEN together: a reversal swaps
	// occupied cells and `setGridChildPosition` rejects a transient overlap, even when the final
	// arrangement is valid. `./snapshot/grid` stages the writes; this rule only says where each
	// child ends up.
	if (
		input.layoutMode === 'GRID' &&
		input.gridColumnCount !== undefined &&
		input.gridColumnCount > 0 &&
		input.gridChildren !== undefined
	) {
		const count = input.gridColumnCount;
		const moves = input.gridChildren
			.map((child) => ({
				childId: child.childId,
				row: child.row,
				column: mirrorColumn(child.column, Math.max(1, child.span), count),
			}))
			// A well-formed grid cannot produce a negative column; if one appears the inputs are not
			// describing a grid, and writing it would throw on the user's file.
			.filter((move) => move.column >= 0);
		if (moves.length > 0) writes.push({ kind: 'grid-reposition', moves });
	}

	// F10 — per child, and safe to write individually: an alignment cannot collide with anything.
	if (input.parentLayoutMode === 'GRID' && isEnd(input.gridChildHorizontalAlign)) {
		writes.push({ kind: 'grid-align', value: flipEnd(input.gridChildHorizontalAlign) });
	}

	// F6 — CENTER and JUSTIFIED are horizontally neutral.
	if (input.textAlignHorizontal === 'LEFT' || input.textAlignHorizontal === 'RIGHT') {
		writes.push({ kind: 'text-align', value: input.textAlignHorizontal === 'LEFT' ? 'RIGHT' : 'LEFT' });
	}

	return writes;
}

/**
 * G1 — does mirroring move this node without being able to rotate what it depicts?
 *
 * The plugin never mirrors artwork (N1), so a directional icon ends up on the other side still
 * pointing the old way. That is the RTL breakage the designer needs to see, and it is reported
 * rather than fixed (LS-11 §2.9). Vector-ish leaf types only: a frame that moves is layout, not art.
 */
export const FLAGGABLE_TYPES: readonly string[] = [
	'VECTOR',
	'STAR',
	'LINE',
	'ELLIPSE',
	'POLYGON',
	'RECTANGLE',
	'BOOLEAN_OPERATION',
];

export function shouldFlagMoved(nodeType: string, moved: boolean): boolean {
	return moved && FLAGGABLE_TYPES.includes(nodeType);
}

/** A parent's child as the move rule needs it: its id, and whether the flow places it. */
export interface FlowChild {
	id: string;
	absolute: boolean;
}

/**
 * The children whose POSITION this parent's plan changes — G1's "moved under F1", plus F9.
 *
 * G1 flags any vector/icon whose position moved. F7 is the child's own `x` write and is detected on
 * the child; this covers the moves its parent causes, which before LS-28 were never flagged — so an
 * icon reordered inside an auto-layout row, the commonest directional icon, went unreported.
 *
 * F1: a reversal moves every flow child except the middle one of an odd count. Absolute children
 * are not placed by the flow, so they neither move with it nor count toward the middle.
 * F9: a grid child moves when its column changes.
 */
export function movedByParent(
	input: MirrorInput,
	writes: readonly MirrorWrite[],
	children: readonly FlowChild[],
): string[] {
	const moved: string[] = [];
	if (writes.some((write) => write.kind === 'reverse-children')) {
		const flowIds = children.filter((child) => !child.absolute).map((child) => child.id);
		flowIds.forEach((id, index) => {
			if (index !== flowIds.length - 1 - index) moved.push(id);
		});
	}
	for (const write of writes) {
		if (write.kind !== 'grid-reposition') continue;
		for (const move of write.moves) {
			const before = input.gridChildren?.find((child) => child.childId === move.childId);
			if (before !== undefined && before.column !== move.column) moved.push(move.childId);
		}
	}
	return moved;
}
