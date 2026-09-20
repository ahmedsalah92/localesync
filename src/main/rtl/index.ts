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
import { restoreByOp, withSnapshot } from '../snapshot';
import type { BatchResult } from '../snapshot';
import { collectContainers } from '../traversal';
import { planMirror, shouldFlagMoved } from './mirror';
import type { MirrorInput, MirrorWrite } from './mirror';

const OP = 'rtl-mirror' as const;

/** Scope is selection-preferred and resolved HERE — the selection lives on the main thread, so the
 *  panel cannot know whether one exists (LS-11 §2.10, matching LS-10 §2.5). */
function resolveScope(intent: ScanScope): ScanScope {
	if (intent === 'page') return 'page';
	return figma.currentPage.selection.length > 0 ? 'selection' : 'page';
}

/** Read everything the rules need off a live node. Absent fields mean the property does not exist
 *  on this node type — the rules treat that as "not applicable", never "unknown". */
export function readMirrorInput(node: SceneNode): MirrorInput {
	const input: MirrorInput = { nodeId: node.id };

	if ('layoutMode' in node) {
		input.layoutMode = node.layoutMode;
		input.primaryAxisAlignItems = node.primaryAxisAlignItems;
		input.counterAxisAlignItems = node.counterAxisAlignItems;
		input.paddingLeft = node.paddingLeft;
		input.paddingRight = node.paddingRight;
		input.itemReverseZIndex = node.itemReverseZIndex;
	}
	if ('children' in node) input.childCount = node.children.length;
	if (node.type === 'INSTANCE') input.isInstance = true;

	const parent = node.parent;
	if (parent !== null && 'layoutMode' in parent) input.parentLayoutMode = parent.layoutMode;
	if (parent !== null && 'width' in parent) input.parentWidth = parent.width;
	if (parent !== null && 'gridColumnCount' in parent) input.parentGridColumnCount = parent.gridColumnCount;

	if ('layoutPositioning' in node) input.layoutPositioning = node.layoutPositioning;
	input.x = node.x;
	input.width = node.width;
	if ('constraints' in node) input.constraintHorizontal = node.constraints.horizontal;
	// Grid fields are read ONLY when the parent really is a grid. They exist on every auto-layout
	// node and report junk off a grid — see the F9 note in ./mirror.
	if (input.parentLayoutMode === 'GRID') {
		if ('gridColumnAnchorIndex' in node) input.gridColumnAnchorIndex = node.gridColumnAnchorIndex;
		if ('gridColumnSpan' in node) input.gridColumnSpan = node.gridColumnSpan;
		if ('gridChildHorizontalAlign' in node) input.gridChildHorizontalAlign = node.gridChildHorizontalAlign;
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
			case 'grid-column':
				if ('setGridChildPosition' in node && 'gridRowAnchorIndex' in node) {
					node.setGridChildPosition(node.gridRowAnchorIndex, write.column);
				}
				break;
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
	await restoreByOp(OP);

	const containers = collectContainers(resolveScope(intent));

	// Containers AND their direct children: a child carries the position, constraint and grid rules,
	// and a text child carries the alignment rule. De-duped — a frame is both a container in its own
	// right and a child of its parent.
	const targets = new Map<string, SceneNode>();
	for (const container of containers) {
		targets.set(container.id, container);
		if ('children' in container) for (const child of container.children) targets.set(child.id, child);
	}

	const plans = new Map<string, MirrorWrite[]>();
	const flagged: FlaggedNode[] = [];
	for (const [id, node] of targets) {
		const writes = planMirror(readMirrorInput(node));
		if (writes.length === 0) continue;
		plans.set(id, writes);
		if (
			shouldFlagMoved(
				node.type,
				writes.some((w) => w.kind === 'x'),
			)
		) {
			flagged.push({ nodeId: id, name: node.name, reason: 'moved-vector' });
		}
	}

	const nodes = [...targets.values()].filter((node) => plans.has(node.id));
	const batch = await withSnapshot(nodes, OP, (node) => {
		applyWrites(node, plans.get(node.id) ?? []);
		return Promise.resolve();
	});

	// Only report a flag for a node the batch actually mirrored.
	const succeeded = new Set(batch.succeeded);
	return { ...batch, flagged: flagged.filter((entry) => succeeded.has(entry.nodeId)) };
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
