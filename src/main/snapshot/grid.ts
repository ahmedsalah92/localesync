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

type GridParent = SceneNode & { gridColumnCount: number; gridRowCount: number };

export interface GridMove {
	child: GridChild;
	row: number;
	column: number;
}

export function isGridParent(node: SceneNode): node is GridParent {
	return 'layoutMode' in node && node.layoutMode === 'GRID' && 'gridColumnCount' in node;
}

export function isGridChild(node: SceneNode): node is GridChild {
	return 'setGridChildPosition' in node && 'gridColumnSpan' in node && 'gridRowAnchorIndex' in node;
}

/**
 * Apply every move atomically enough that no intermediate state collides.
 *
 * Capacity is never a problem: the staging half is a full copy of the grid's own width, and the
 * movers are a subset of its children, so what fits in the grid fits in the staging half.
 *
 * If widening throws — a runtime that refuses it, a grid that clamps — this falls back to writing
 * the moves directly. That can still collide, and it is reported rather than swallowed: a silent
 * fallback would turn a loud failure into a half-mirrored canvas.
 */
export function placeGridChildren(parent: GridParent, moves: readonly GridMove[]): void {
	if (moves.length === 0) return;

	const width = parent.gridColumnCount;
	const rows = parent.gridRowCount;
	if (width <= 0) return;

	let widened = false;
	try {
		parent.gridColumnCount = width * 2;
		widened = true;
	} catch {
		widened = false;
	}

	if (widened) {
		// Park every mover in the empty right half, walking a cursor so a spanning child cannot
		// overlap the one parked before it.
		let row = 0;
		let column = 0;
		for (const move of moves) {
			const span = Math.max(1, move.child.gridColumnSpan);
			if (column + span > width) {
				row += 1;
				column = 0;
			}
			if (row >= rows) break; // out of staging space — leave the rest to the direct write below
			move.child.setGridChildPosition(row, width + column);
			column += span;
		}
	}

	for (const move of moves) move.child.setGridChildPosition(move.row, move.column);

	if (widened) parent.gridColumnCount = width;
}
