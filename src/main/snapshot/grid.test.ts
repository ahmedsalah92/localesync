// src/main/snapshot/grid.test.ts — the staged grid write, against a fake that enforces Figma's rule.
//
// `placeGridChildren` touches no `figma` global, only the nodes it is handed, so it can be proven
// here rather than only in the in-Figma harness. The fake reproduces the one behaviour that matters:
// `setGridChildPosition` throws on ANY overlap or out-of-bounds cell, transient or not.
import { describe, expect, it } from 'vitest';
import { isGridParent, placeGridChildren } from './grid';

interface FakeChild {
	id: string;
	gridRowAnchorIndex: number;
	gridColumnAnchorIndex: number;
	gridRowSpan: number;
	gridColumnSpan: number;
	setGridChildPosition(row: number, column: number): void;
}

function fakeGrid(
	columns: number,
	rows: number,
	cells: { id: string; row: number; column: number; rowSpan?: number; colSpan?: number }[],
) {
	let columnCount = columns;
	const children: FakeChild[] = [];
	const covers = (c: FakeChild, row: number, column: number) =>
		row >= c.gridRowAnchorIndex &&
		row < c.gridRowAnchorIndex + c.gridRowSpan &&
		column >= c.gridColumnAnchorIndex &&
		column < c.gridColumnAnchorIndex + c.gridColumnSpan;

	for (const cell of cells) {
		const child: FakeChild = {
			id: cell.id,
			gridRowAnchorIndex: cell.row,
			gridColumnAnchorIndex: cell.column,
			gridRowSpan: cell.rowSpan ?? 1,
			gridColumnSpan: cell.colSpan ?? 1,
			setGridChildPosition(row, column) {
				if (row < 0 || column < 0 || row + this.gridRowSpan > rows || column + this.gridColumnSpan > columnCount) {
					throw new Error(`${this.id} out of bounds at (${row},${column})`);
				}
				for (const other of children) {
					if (other === this) continue;
					for (let r = row; r < row + this.gridRowSpan; r++) {
						for (let c = column; c < column + this.gridColumnSpan; c++) {
							if (covers(other, r, c)) throw new Error(`${this.id} overlaps ${other.id} at (${r},${c})`);
						}
					}
				}
				this.gridRowAnchorIndex = row;
				this.gridColumnAnchorIndex = column;
			},
		};
		children.push(child);
	}

	const grid = {
		layoutMode: 'GRID',
		gridItemsPositioning: 'MANUAL',
		gridRowCount: rows,
		get gridColumnCount() {
			return columnCount;
		},
		set gridColumnCount(value: number) {
			const cut = children.find((c) => c.gridColumnAnchorIndex + c.gridColumnSpan > value);
			if (cut !== undefined) throw new Error(`shrinking to ${value} would cut ${cut.id}`);
			columnCount = value;
		},
		children,
	};
	return grid;
}

type Grid = ReturnType<typeof fakeGrid>;
const asParent = (grid: Grid) => grid as unknown as Parameters<typeof placeGridChildren>[0];
const child = (grid: Grid, id: string) => {
	const found = grid.children.find((c) => c.id === id);
	if (found === undefined) throw new Error(`no child ${id}`);
	return found as unknown as Parameters<typeof placeGridChildren>[1][number]['child'];
};
const at = (grid: Grid, id: string) => {
	const found = grid.children.find((c) => c.id === id);
	return [found?.gridRowAnchorIndex, found?.gridColumnAnchorIndex];
};

describe('placeGridChildren', () => {
	// The fixture's own row: a full 3-column row with a 2-column spanner. Direct writes collide.
	it('reverses a full row with a spanning child, and shrinks the grid back', () => {
		const grid = fakeGrid(3, 1, [
			{ id: 'wide', row: 0, column: 0, colSpan: 2 },
			{ id: 'narrow', row: 0, column: 2 },
		]);
		placeGridChildren(asParent(grid), [
			{ child: child(grid, 'wide'), row: 0, column: 1 },
			{ child: child(grid, 'narrow'), row: 0, column: 0 },
		]);
		expect(at(grid, 'wide')).toEqual([0, 1]);
		expect(at(grid, 'narrow')).toEqual([0, 0]);
		expect(grid.gridColumnCount).toBe(3);
	});

	/**
	 * Regression: the parking cursor tracked column span only. A child spanning two ROWS was parked
	 * in row 0 and the next mover was parked straight into the row it still covered.
	 */
	it('parks a row-spanning child without colliding with the one parked below it', () => {
		const grid = fakeGrid(2, 2, [
			{ id: 'tall', row: 0, column: 0, rowSpan: 2 },
			{ id: 'top', row: 0, column: 1 },
			{ id: 'bottom', row: 1, column: 1 },
		]);
		placeGridChildren(asParent(grid), [
			{ child: child(grid, 'tall'), row: 0, column: 1 },
			{ child: child(grid, 'top'), row: 0, column: 0 },
			{ child: child(grid, 'bottom'), row: 1, column: 0 },
		]);
		expect(at(grid, 'tall')).toEqual([0, 1]);
		expect(at(grid, 'top')).toEqual([0, 0]);
		expect(at(grid, 'bottom')).toEqual([1, 0]);
	});

	/**
	 * Regression: "what fits in the grid fits in the staging half" was true of AREA but not of the
	 * greedy packing, which fragments. Here it ran out of rows, left one mover unparked, and the
	 * final writes collided with it. Children listed out of grid order, as `children` can be.
	 */
	it('never runs out of staging space, whatever order the children arrive in', () => {
		const grid = fakeGrid(3, 2, [
			{ id: 'a', row: 0, column: 0, colSpan: 2 },
			{ id: 'c', row: 1, column: 0, colSpan: 2 },
			{ id: 'b', row: 0, column: 2 },
			{ id: 'd', row: 1, column: 2 },
		]);
		placeGridChildren(asParent(grid), [
			{ child: child(grid, 'a'), row: 0, column: 1 },
			{ child: child(grid, 'c'), row: 1, column: 1 },
			{ child: child(grid, 'b'), row: 0, column: 0 },
			{ child: child(grid, 'd'), row: 1, column: 0 },
		]);
		expect([at(grid, 'a'), at(grid, 'b'), at(grid, 'c'), at(grid, 'd')]).toEqual([
			[0, 1],
			[0, 0],
			[1, 1],
			[1, 0],
		]);
		expect(grid.gridColumnCount).toBe(3);
	});

	it('is a no-op for no moves', () => {
		const grid = fakeGrid(2, 1, [{ id: 'a', row: 0, column: 0 }]);
		placeGridChildren(asParent(grid), []);
		expect(at(grid, 'a')).toEqual([0, 0]);
		expect(grid.gridColumnCount).toBe(2);
	});
});

/**
 * In `ROW_AUTO_FLOW` a grid positions children by layer order and `setGridChildPosition` THROWS
 * (plugin typings, GridChildrenMixin). Treating one as a grid made the mirror throw, and — worse —
 * captured positions whose restore throws too, so restore-on-launch would fail on every launch.
 */
describe('isGridParent', () => {
	it('accepts a manually positioned grid', () => {
		expect(isGridParent(fakeGrid(2, 1, []) as unknown as SceneNode)).toBe(true);
	});

	it('rejects an auto-flow grid', () => {
		const grid = { ...fakeGrid(2, 1, []), gridItemsPositioning: 'ROW_AUTO_FLOW' };
		expect(isGridParent(grid as unknown as SceneNode)).toBe(false);
	});
});
