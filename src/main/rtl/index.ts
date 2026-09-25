// src/main/rtl/index.ts  (main thread; uses the `figma` global)
//
// LS-11 public API: apply and revert the RTL layout mirror.
//
// The rules live in `./mirror` (pure, unit-tested); this module is the canvas side — scope
// resolution, reading each node's shape off the live graph, the guarded batch, and the message
// handlers. Structure mirrors `src/main/pseudoloc/index.ts` deliberately: same shape, same command
// semantics, so the two panels behave identically.
//
// This is the first caller of LS-4's *layout* arm (`LayoutSnapshot`), added for exactly this.
import type { ScanScope } from '../../common/messages';
import type { FlaggedNode } from '../../common/models';
import { on, send } from '../bridge';
import { isGridChild, isGridParent, placeGridChildren } from '../snapshot/grid';
import { restoreByOp, withSnapshot } from '../snapshot';
import type { BatchResult } from '../snapshot';
import { NoSelectionError, collectContainers } from '../traversal';
import { movedByParent, planMirror, shouldFlagMoved } from './mirror';
import type { MirrorInput, MirrorWrite } from './mirror';
import { resolveMirrorScope } from './scope';

const OP = 'rtl-mirror' as const;

/** Read everything the rules need off a live node. Absent fields mean the property does not exist
 *  on this node type — the rules treat that as "not applicable", never "unknown". */
export function readMirrorInput(node: SceneNode): MirrorInput {
	const input: MirrorInput = { nodeId: node.id };

	if ('layoutMode' in node) {
		input.layoutMode = node.layoutMode;
		// Auto-layout properties are readable on any frame but only writable on one that has
		// auto-layout — see the capture gate in ../snapshot.
		if (node.layoutMode !== 'NONE') {
			input.primaryAxisAlignItems = node.primaryAxisAlignItems;
			input.counterAxisAlignItems = node.counterAxisAlignItems;
			input.paddingLeft = node.paddingLeft;
			input.paddingRight = node.paddingRight;
			input.itemReverseZIndex = node.itemReverseZIndex;
		}
	}
	if ('children' in node) input.childCount = node.children.length;
	if (node.type === 'INSTANCE') input.isInstance = true;
	if (node.type === 'GROUP') input.isGroup = true;

	const parent = node.parent;
	if (parent !== null && 'layoutMode' in parent) input.parentLayoutMode = parent.layoutMode;
	if (parent !== null && 'width' in parent) input.parentWidth = parent.width;

	if ('layoutPositioning' in node) input.layoutPositioning = node.layoutPositioning;
	input.x = node.x;
	input.width = node.width;
	if ('constraints' in node) input.constraintHorizontal = node.constraints.horizontal;
	// Grid fields are read ONLY when the parent really is a grid: they exist on every auto-layout
	// node and report junk off one — see the F9 note in ./mirror.
	if (input.parentLayoutMode === 'GRID' && 'gridChildHorizontalAlign' in node) {
		input.gridChildHorizontalAlign = node.gridChildHorizontalAlign;
	}
	// When this node IS a grid, read its children's positions: the columns are reflected for the
	// whole grid at once, because they have to be written that way.
	if (isGridParent(node) && 'children' in node) {
		input.gridColumnCount = node.gridColumnCount;
		input.gridChildren = node.children.filter(isGridChild).map((child) => ({
			childId: child.id,
			row: child.gridRowAnchorIndex,
			column: child.gridColumnAnchorIndex,
			span: child.gridColumnSpan,
		}));
	}
	if (node.type === 'TEXT') input.textAlignHorizontal = node.textAlignHorizontal;

	return input;
}

/** Apply one node's writes. `reverse-children` runs LAST: it re-derives every child's position, so
 *  anything after it would fight the layout (LS-11 §2.3, mirroring `planLayoutRestore`'s order). */
function applyWrites(node: SceneNode, writes: readonly MirrorWrite[]): void {
	const ordered = [...writes].sort(
		(a, b) => Number(a.kind === 'reverse-children') - Number(b.kind === 'reverse-children'),
	);
	for (const write of ordered) {
		switch (write.kind) {
			case 'primary-align':
				if ('primaryAxisAlignItems' in node) node.primaryAxisAlignItems = write.value;
				break;
			case 'counter-align':
				if ('counterAxisAlignItems' in node) node.counterAxisAlignItems = write.value;
				break;
			case 'padding':
				if ('paddingLeft' in node) {
					node.paddingLeft = write.left;
					node.paddingRight = write.right;
				}
				break;
			case 'item-reverse-z':
				if ('itemReverseZIndex' in node) node.itemReverseZIndex = write.value;
				break;
			case 'x':
				node.x = write.x;
				break;
			case 'constraint-horizontal':
				if ('constraints' in node) node.constraints = { ...node.constraints, horizontal: write.value };
				break;
			case 'grid-reposition': {
				// Staged by ./snapshot/grid: a reversal swaps occupied cells, and setGridChildPosition
				// rejects a transient overlap even when the final arrangement is valid.
				if (!isGridParent(node) || !('children' in node)) break;
				const byId = new Map(node.children.filter(isGridChild).map((child) => [child.id, child]));
				placeGridChildren(
					node,
					write.moves.flatMap((move) => {
						const child = byId.get(move.childId);
						return child === undefined ? [] : [{ child, row: move.row, column: move.column }];
					}),
				);
				break;
			}
			case 'grid-align':
				if ('gridChildHorizontalAlign' in node) node.gridChildHorizontalAlign = write.value;
				break;
			case 'text-align':
				if (node.type === 'TEXT') node.textAlignHorizontal = write.value;
				break;
			case 'reverse-children':
				if ('children' in node) {
					const reversed = [...node.children].reverse();
					reversed.forEach((child, index) => {
						node.insertChild(index, child);
					});
				}
				break;
		}
	}
}

export interface MirrorResult extends BatchResult {
	flagged: FlaggedNode[];
}

/**
 * Apply the mirror to every container in scope and to their direct children.
 *
 * **Restores first (§2.7)**, so a second apply mirrors from the source rather than compounding a
 * mirror on a mirror. LS-4's `already-mutated` guard is the backstop, not the mechanism.
 *
 * **Every plan is computed BEFORE the batch mutates anything.** `withSnapshot` captures all
 * snapshots first and mutates in a second loop, so an earlier mutation is visible to a later read —
 * and reversing a parent's children moves its siblings. Planning from live nodes inside `mutate`
 * would therefore mirror some nodes against an already-mirrored parent. Same hazard, and the same
 * fix, as LS-10 §2.7a's pre-batch source map.
 */
export async function applyRtlMirror(intent: ScanScope): Promise<MirrorResult> {
	// dynamic-page: findAllWithCriteria throws on an unloaded page (agent-guidelines §2).
	await figma.currentPage.loadAsync();
	// Before anything is touched — including the restore — so "nothing selected" leaves the canvas
	// exactly as it was (LS-33).
	const scope = resolveMirrorScope(intent, figma.currentPage.selection.length);
	if (scope === 'no-selection') throw new NoSelectionError();
	await restoreByOp(OP);

	const containers = collectContainers(scope);

	// Containers AND their direct children: a child carries the position, constraint and grid rules,
	// and a text child carries the alignment rule. De-duped — a frame is both a container in its own
	// right and a child of its parent.
	const targets = new Map<string, SceneNode>();
	for (const container of containers) {
		targets.set(container.id, container);
		if ('children' in container) for (const child of container.children) targets.set(child.id, child);
	}

	const plans = new Map<string, MirrorWrite[]>();
	// Each flag records the node whose write causes the move — the icon itself for F7, its parent for
	// F1/F9 — because only that node's success means the icon really moved. A child moved by its
	// parent has no writes of its own and never enters the batch, so filtering on the child would
	// silently drop every parent-driven flag.
	const flagged = new Map<string, { entry: FlaggedNode; cause: string }>();
	const flag = (node: SceneNode, cause: string): void => {
		if (!flagged.has(node.id))
			flagged.set(node.id, { entry: { nodeId: node.id, name: node.name, reason: 'moved-vector' }, cause });
	};
	for (const [id, node] of targets) {
		const input = readMirrorInput(node);
		const writes = planMirror(input);
		if (writes.length === 0) continue;
		plans.set(id, writes);
		// G1 via F7: the node's own `x` moved.
		if (
			shouldFlagMoved(
				node.type,
				writes.some((w) => w.kind === 'x'),
			)
		) {
			flag(node, id);
		}
		// G1 via F1/F9: the parent's reversal or grid reflection moved its children (LS-28).
		if ('children' in node) {
			const children = node.children.map((child) => ({
				id: child.id,
				absolute: 'layoutPositioning' in child && child.layoutPositioning === 'ABSOLUTE',
			}));
			for (const childId of movedByParent(input, writes, children)) {
				const child = node.children.find((c) => c.id === childId);
				if (child !== undefined && shouldFlagMoved(child.type, true)) flag(child, id);
			}
		}
	}

	const nodes = [...targets.values()].filter((node) => plans.has(node.id));
	const batch = await withSnapshot(nodes, OP, (node) => {
		applyWrites(node, plans.get(node.id) ?? []);
		return Promise.resolve();
	});

	// Only report a flag whose move actually happened: the node that causes it was mirrored.
	const succeeded = new Set(batch.succeeded);
	return {
		...batch,
		flagged: [...flagged.values()].filter(({ cause }) => succeeded.has(cause)).map(({ entry }) => entry),
	};
}

/** Revert only this op's nodes, leaving an active preview or pseudo-loc alone (§2.7). */
export async function revertRtlMirror(): Promise<BatchResult> {
	return restoreByOp(OP);
}

/**
 * Both messages are COMMANDS (no `RequestResponse` entry), so the outcome reports on
 * `progress`/`error` correlated by id — the same mapping `registerPseudoLoc` documents.
 */
export function registerRtlMirror(): void {
	on('apply-rtl-mirror', (msg) => {
		void (async () => {
			try {
				const batch = await applyRtlMirror(msg.scope);

				if (batch.failed.length > 0) {
					send({
						type: 'error',
						id: msg.id,
						code: 'mutation-failed',
						severity: 'error',
						message: 'The RTL mirror failed and the canvas was restored.',
					});
					return;
				}

				if (batch.succeeded.length === 0 && batch.blocked.length === 0) {
					send({
						type: 'error',
						id: msg.id,
						code: 'no-text-nodes',
						severity: 'error',
						message: 'No mirrorable layers in scope.',
					});
					return;
				}

				// Before the terminal progress, so a panel treating progress as "finished" already holds
				// the review list when it renders. No message at all when there is nothing to review.
				if (batch.flagged.length > 0) {
					send({ type: 'rtl-flagged', id: msg.id, flagged: batch.flagged });
				}

				if (batch.blocked.length > 0) {
					send({
						type: 'error',
						id: msg.id,
						code: 'nodes-blocked',
						severity: 'warning',
						message: `${batch.blocked.length} layer(s) were skipped and flagged, not mirrored.`,
						blocked: batch.blocked,
					});
				}

				send({
					type: 'progress',
					id: msg.id,
					completed: batch.succeeded.length,
					total: batch.succeeded.length + batch.blocked.length,
				});
			} catch (err) {
				if (err instanceof NoSelectionError) {
					send({ type: 'error', id: msg.id, code: 'no-selection', severity: 'error', message: err.message });
					return;
				}
				send({
					type: 'error',
					id: msg.id,
					code: 'internal',
					severity: 'error',
					message: `RTL mirror failed: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		})();
	});

	on('revert-rtl-mirror', (msg) => {
		void (async () => {
			try {
				const batch = await revertRtlMirror();
				if (batch.failed.length > 0) {
					// A restore failure keeps the durable snapshot on purpose, so restore-on-launch retries.
					send({
						type: 'error',
						id: msg.id,
						code: 'mutation-failed',
						severity: 'error',
						message: `${batch.failed.length} layer(s) could not be restored. They will be restored next time the plugin opens.`,
					});
					return;
				}
				send({
					type: 'progress',
					id: msg.id,
					completed: batch.succeeded.length,
					total: batch.succeeded.length,
				});
			} catch (err) {
				send({
					type: 'error',
					id: msg.id,
					code: 'internal',
					severity: 'error',
					message: `Revert failed: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		})();
	});
}
