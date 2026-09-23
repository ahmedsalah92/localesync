// src/main/snapshot/grid.ts — OWNED by LS-4. The one safe way to re-place children in a grid.
//
// `setGridChildPosition` throws if the write TRANSIENTLY overlaps another child, even when the
// final arrangement is perfectly valid. Any permutation that swaps two occupied cells therefore
// fails on its first write — and a reversal is all swaps.
//
// There is no ordering that avoids it. A cycle of occupied cells needs somewhere to put the first
// child before the last one vacates, and a full grid has no free cell. So the placement is staged:
// widen the grid, park every mover in the empty half, place them all at their targets, shrink back.
//
// Each mover is parked at its CURRENT cell shifted right by the grid's width. The current
// arrangement is valid by definition, so its translated copy is too — whatever the row spans,
// column spans or child order. An earlier greedy packing tracked column span only and fragmented,
// so a row-spanning child or an unlucky order collided while parking (see grid.test.ts).
//
// Both callers need this and for the same reason: LS-11's mirror reverses columns, and LS-4's
// restore puts them back. A restore that collided would fail the rollback of a failed batch, which
// is the one outcome the snapshot primitive exists to prevent.
//
// ⚠️ Mandatory human review before merge, like the rest of this module.

/** A child that can be positioned in a grid. */
type GridChild = SceneNode & {
	setGridChildPosition(rowIndex: number, columnIndex: number): void;
	readonly gridColumnSpan: number;
	readonly gridRowAnchorIndex: number;
	readonly gridColumnAnchorIndex: number;
};

type GridParent = SceneNode & { gridColumnCount: number };

export interface GridMove {
	child: GridChild;
	row: number;
	column: number;
}

/**
 * A grid whose children WE position. An auto-flow grid is not one: it places children by layer
 * order, and `setGridChildPosition` throws on it. Its order is already captured and restored as
 * `childOrder` through `insertChild`, which is the API's own prescribed way to reorder it.
 */
export function isGridParent(node: SceneNode): node is GridParent {
	return (
		'layoutMode' in node &&
		node.layoutMode === 'GRID' &&
		'gridColumnCount' in node &&
		(!('gridItemsPositioning' in node) || node.gridItemsPositioning !== 'ROW_AUTO_FLOW')
	);
}

export function isGridChild(node: SceneNode): node is GridChild {
	return 'setGridChildPosition' in node && 'gridColumnSpan' in node && 'gridRowAnchorIndex' in node;
}

/**
 * Apply every move without any intermediate state colliding.
 *
 * If widening throws — a runtime that refuses it, a grid that clamps — this falls back to writing
 * the moves directly. That can still collide, and it is reported rather than swallowed: a silent
 * fallback would turn a loud failure into a half-mirrored canvas. A throw here leaves the grid
 * widened; the snapshot captures `gridColumnCount`, so the caller's rollback restores the width.
 */
export function placeGridChildren(parent: GridParent, moves: readonly GridMove[]): void {
	if (moves.length === 0) return;

	const width = parent.gridColumnCount;
	if (width <= 0) return;

	let widened = false;
	try {
		parent.gridColumnCount = width * 2;
		widened = true;
	} catch {
		widened = false;
	}

	if (widened) {
		// Snapshot every anchor BEFORE moving anything: each park vacates a cell another mover may
		// be read from, and the translation is only collision-free if it copies one arrangement.
		const parked = moves.map((move) => ({
			child: move.child,
			row: move.child.gridRowAnchorIndex,
			column: width + move.child.gridColumnAnchorIndex,
		}));
		for (const park of parked) park.child.setGridChildPosition(park.row, park.column);
	}

	for (const move of moves) move.child.setGridChildPosition(move.row, move.column);

	if (widened) parent.gridColumnCount = width;
}
