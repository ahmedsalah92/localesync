// src/main/snapshot/index.ts  (main thread; uses the `figma` global) — OWNED by LS-4.
//
// The durable snapshot/restore primitive under every canvas-mutating feature (pseudo-loc, RTL
// mirror, preview). The safety guarantee is DURABLE-BEFORE-MUTATE + RESTORE-ON-LAUNCH, not the
// close handler (agent-guidelines §2, Design model §3):
//   • a node's snapshot is written to its pluginData and its id to the clientStorage manifest
//     BEFORE the first mutation touches it;
//   • restore writes ABSOLUTE captured values, so it converges regardless of interleaved user undo;
//   • on launch a non-empty manifest means a prior session ended mid-mutation — restoreAll() heals it.
// Batch-first by design (spec §5 scope note): ONE manifest read-modify-write per batch, bulk apply.
//
// ⚠️ Mandatory human review before merge (agent-guidelines §8): the blast radius is corruption of
// real user files.
//
// The primitive itself sends no bridge messages: the consuming features (LS-10/11/12) own the
// apply/revert message handlers and call withSnapshot/restoreAll from them.
import {
	deserializeSnapshot,
	isRecognizedSchema,
	mergeManifest,
	mutationBlockReason,
	planRestore,
	removeFromManifest,
	serializeSnapshot,
} from './plan';
import { isGridChild, isGridParent, placeGridChildren } from './grid';
import { MANIFEST_KEY, SNAPSHOT_KEY, SNAPSHOT_MAX_BYTES, SNAPSHOT_SCHEMA_VERSION, SnapshotError } from './types';
import type {
	BatchResult,
	EligibilityFlags,
	LayoutSnapshot,
	Manifest,
	MutationOp,
	NodeSnapshot,
	RestoreResult,
	RestoreStep,
	TextNodeSnapshot,
} from './types';

// Re-export the public contract so consumers import from '../snapshot'.
export { SNAPSHOT_KEY, MANIFEST_KEY, SnapshotError, mutationBlockReason, planRestore };
export type {
	MutationOp,
	TextNodeSnapshot,
	LayoutSnapshot,
	NodeSnapshot,
	Manifest,
	EligibilityFlags,
	RestoreResult,
	BatchResult,
};

// ── session state ────────────────────────────────────────────────────────────
// In-memory refs of nodes mutated THIS session — the ONLY input the best-effort close handler has
// (Design model §3). Durable recovery never reads this; restore-on-launch reads the manifest.
const liveMutations = new Map<string, { node: SceneNode; snapshot: NodeSnapshot }>();

/**
 * Can this id still be restored onto a live scene node?
 *
 * **Shared by `restoreNode` and `restoreIds` on purpose.** They had separate copies, and when
 * LS-11's layout arm widened one from `type !== 'TEXT'` to "is it still a scene node", the other
 * kept the text-only test — so every frame in a manifest read as NODE_GONE: its entry was dropped,
 * its durable snapshot orphaned, and its layout never restored. Restore-on-launch would have left
 * a mirrored file mirrored forever, which is the worst outcome this module exists to prevent.
 */
function isRestorable(node: BaseNode | null): node is SceneNode {
	return node !== null && node.type !== 'PAGE' && node.type !== 'DOCUMENT' && 'parent' in node;
}

// ── eligibility (live-node derivation of EligibilityFlags) ─────────────────────
function isInsideInstance(node: BaseNode): boolean {
	let current: BaseNode | null = node.parent;
	while (current !== null && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
		if (current.type === 'INSTANCE') return true;
		current = current.parent;
	}
	return false;
}

function eligibilityFlagsOf(node: SceneNode): EligibilityFlags {
	// The first three are text properties. A frame has no font and no characters, so they are false
	// rather than unknown — a container is never blocked for a reason that cannot apply to it
	// (LS-11 §1.2). `inInstance` and `alreadyMutated` are meaningful for every node type.
	const text = node.type === 'TEXT' ? node : null;
	return {
		hasMissingFont: text?.hasMissingFont ?? false,
		isMixedFont: text !== null && text.fontName === figma.mixed,
		inInstance: isInsideInstance(node),
		empty: text !== null && text.characters.length === 0,
		// Per-node pluginData, not the manifest: both are cleared together on restore and on
		// rollback, and this is the authoritative record for the node in front of us. A snapshot
		// surviving a failed restore-on-launch also reads as mutated here, which is correct — that
		// node still holds transformed text and must not be captured again.
		alreadyMutated: node.getPluginData(SNAPSHOT_KEY) !== '',
	};
}

// ── fonts ──────────────────────────────────────────────────────────────────────
/** Loads every font the node uses (mixed → getRangeAllFontNames(0, len)). Throws
 *  SnapshotError('MISSING_FONT') if node.hasMissingFont — a missing-font node will not re-layout and
 *  must never be mutated (agent-guidelines §2). */
export async function ensureFontsLoaded(node: TextNode): Promise<void> {
	if (node.hasMissingFont) {
		throw new SnapshotError('MISSING_FONT', node.id, 'Node has a missing font — cannot load fonts or mutate');
	}
	const fontName = node.fontName;
	if (fontName === figma.mixed) {
		const fonts = node.getRangeAllFontNames(0, node.characters.length);
		await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
	} else {
		await figma.loadFontAsync(fontName);
	}
}

// ── capture ──────────────────────────────────────────────────────────────────
/**
 * LS-11's layout arm. Each field is captured **only when the node actually has it** — a VECTOR has
 * no `layoutMode`, grid anchors exist only on the direct child of a GRID frame — so an absent field
 * means "not applicable", and restore never writes a property that would throw.
 *
 * `childOrder` is deliberately skipped for an INSTANCE: its children cannot be reparented, so the
 * order can neither change nor be restored.
 */
function captureLayoutSnapshot(node: SceneNode, op: MutationOp, capturedAt: number): LayoutSnapshot {
	const snapshot: LayoutSnapshot = {
		schemaVersion: SNAPSHOT_SCHEMA_VERSION,
		kind: 'layout',
		nodeId: node.id,
		op,
		x: node.x,
		y: node.y,
		capturedAt,
	};
	if ('layoutMode' in node) {
		snapshot.layoutMode = node.layoutMode;
		snapshot.primaryAxisAlignItems = node.primaryAxisAlignItems;
		snapshot.counterAxisAlignItems = node.counterAxisAlignItems;
		snapshot.paddingLeft = node.paddingLeft;
		snapshot.paddingRight = node.paddingRight;
		snapshot.itemReverseZIndex = node.itemReverseZIndex;
	}
	if ('children' in node && node.type !== 'INSTANCE') {
		snapshot.childOrder = node.children.map((child) => child.id);
	}
	const parent = node.parent;
	if (parent !== null && 'layoutMode' in parent) snapshot.parentLayoutMode = parent.layoutMode;
	if ('constraints' in node) snapshot.constraintHorizontal = node.constraints.horizontal;
	if ('layoutPositioning' in node) snapshot.layoutPositioning = node.layoutPositioning;
	// Per-child ALIGNMENT is safe to capture on the child; POSITION is not, and is captured on the
	// parent below. Both properties exist on every auto-layout node and report junk off a grid.
	if (snapshot.parentLayoutMode === 'GRID' && 'gridChildHorizontalAlign' in node) {
		snapshot.gridChildHorizontalAlign = node.gridChildHorizontalAlign;
	}
	// The whole grid's child positions, recorded on the grid itself: a permutation cannot be
	// restored one member at a time without a transient collision — see ./grid.
	if (isGridParent(node) && 'children' in node) {
		snapshot.gridChildPositions = node.children.filter(isGridChild).map((child) => ({
			childId: child.id,
			row: child.gridRowAnchorIndex,
			column: child.gridColumnAnchorIndex,
		}));
	}
	return snapshot;
}

function captureTextSnapshot(node: TextNode, op: MutationOp, capturedAt: number): TextNodeSnapshot {
	return {
		schemaVersion: SNAPSHOT_SCHEMA_VERSION,
		kind: 'text',
		nodeId: node.id,
		op,
		characters: node.characters,
		textAutoResize: node.textAutoResize,
		textTruncation: node.textTruncation,
		maxLines: node.maxLines,
		width: node.width,
		height: node.height,
		x: node.x,
		y: node.y,
		textAlignHorizontal: node.textAlignHorizontal,
		textAlignVertical: node.textAlignVertical,
		capturedAt,
	};
}

/** Dispatch on node type: a TEXT node keeps the proven text arm, everything else takes the layout
 *  arm. The mirror calls this with both in one batch (LS-11 §1.2). */
function captureSnapshot(node: SceneNode, op: MutationOp, capturedAt: number): NodeSnapshot {
	return node.type === 'TEXT'
		? captureTextSnapshot(node, op, capturedAt)
		: captureLayoutSnapshot(node, op, capturedAt);
}

function readSnapshot(node: SceneNode): NodeSnapshot | null {
	const json = node.getPluginData(SNAPSHOT_KEY);
	if (json === '') return null; // absent key returns '' — treat as no durable snapshot
	let snapshot: NodeSnapshot;
	try {
		snapshot = deserializeSnapshot(json);
	} catch {
		return null; // corrupt payload — degrade to idempotent no-op rather than throw
	}
	if (!isRecognizedSchema(snapshot)) {
		// Best-effort restore of the fields present; log, don't throw (Resolved Defaults §7).
		console.warn(
			`[snapshot] ${node.id}: unrecognized schemaVersion ${String(snapshot.schemaVersion)} — best-effort restore`,
		);
	}
	return snapshot;
}

// ── restore applier (impure, but drives the pure plan) ─────────────────────────
// Synchronous property writes only, so the close handler can reuse it without awaiting (fonts are
// already loaded there). Ordering — resize before mode, maxLines gated on ENDING — lives in
// planRestore, not here.
function applyRestorePlan(node: SceneNode, steps: readonly RestoreStep[]): void {
	for (const step of steps) {
		// Every text step below is planned only for a TEXT snapshot, so this narrowing can never
		// discard a step that was meant to run — it satisfies the compiler without changing behaviour.
		const text = node.type === 'TEXT' ? node : null;
		switch (step.kind) {
			case 'set-characters':
				if (text) text.characters = step.characters;
				break;
			case 'resize':
				// Zero-size restore (Resolved Defaults §8): captured dims come from a live node Figma
				// already floored at 0.01 (as a float32 that lands marginally under 0.01), so the resize
				// input is always legal. Assert against genuine corruption (≤ 0 / non-finite) in dev
				// builds — never clamp.
				if (import.meta.env.DEV && !(step.width > 0 && step.height > 0)) {
					console.warn(`[snapshot] illegal restore dims ${step.width}×${step.height}`);
				}
				if (text) text.resizeWithoutConstraints(step.width, step.height);
				break;
			case 'set-auto-resize':
				if (text) text.textAutoResize = step.mode;
				break;
			case 'set-truncation':
				if (text) text.textTruncation = step.textTruncation;
				break;
			case 'set-max-lines':
				if (text) text.maxLines = step.maxLines;
				break;
			case 'set-position':
				node.x = step.x;
				node.y = step.y;
				break;
			case 'set-align':
				if (text) {
					text.textAlignHorizontal = step.horizontal;
					text.textAlignVertical = step.vertical;
				}
				break;

			// ── LS-11's layout arm ──
			// Each guard mirrors the capture guard: a field is only ever planned when the node had it,
			// so these `in` checks are belt-and-braces against a snapshot restored onto a retyped node.
			case 'set-layout-align':
				if ('primaryAxisAlignItems' in node) {
					if (step.primary !== undefined) node.primaryAxisAlignItems = step.primary;
					if (step.counter !== undefined) node.counterAxisAlignItems = step.counter;
				}
				break;
			case 'set-padding':
				if ('paddingLeft' in node) {
					node.paddingLeft = step.left;
					node.paddingRight = step.right;
				}
				break;
			case 'set-item-reverse-z':
				if ('itemReverseZIndex' in node) node.itemReverseZIndex = step.value;
				break;
			case 'set-x':
				node.x = step.x;
				break;
			case 'set-constraint-horizontal':
				if ('constraints' in node) node.constraints = { ...node.constraints, horizontal: step.value };
				break;
			case 'set-grid-positions': {
				if (!isGridParent(node) || !('children' in node)) break;
				const byId = new Map(node.children.filter(isGridChild).map((child) => [child.id, child]));
				const moves = step.positions.flatMap((position) => {
					const child = byId.get(position.childId);
					// A child deleted since capture is skipped; the rest still land correctly.
					return child === undefined ? [] : [{ child, row: position.row, column: position.column }];
				});
				placeGridChildren(node, moves);
				break;
			}
			case 'set-grid-align':
				if ('gridChildHorizontalAlign' in node && step.value !== undefined) {
					node.gridChildHorizontalAlign = step.value;
				}
				break;
			case 'set-child-order': {
				// Re-insertion is the only way to restore a permutation. Insert in the recorded order:
				// each call moves that child to `index`, so after the last one the array matches exactly.
				if (!('children' in node)) break;
				const byId = new Map(node.children.map((child) => [child.id, child]));
				step.childIds.forEach((id, index) => {
					const child = byId.get(id);
					// A child deleted since capture is skipped rather than throwing — the remaining
					// children still land in their recorded relative order.
					if (child !== undefined) node.insertChild(index, child);
				});
				break;
			}
		}
	}
}

/** Load fonts → apply the restore plan → clear the node's snapshot pluginData. Does NOT touch the
 *  clientStorage manifest — the caller batches that. Throws RESTORE_FAILED if the font is
 *  unavailable on this machine (Resolved Defaults §5). */
async function restoreNodeProperties(node: SceneNode, snapshot: NodeSnapshot): Promise<void> {
	// Fonts are a text concern: a layout restore writes no glyphs and must not fail on a missing one.
	if (node.type === 'TEXT') {
		try {
			await ensureFontsLoaded(node);
		} catch {
			throw new SnapshotError('RESTORE_FAILED', node.id, 'Font unavailable at restore time');
		}
	}
	applyRestorePlan(node, planRestore(snapshot, { inInstance: isInsideInstance(node) }));
	node.setPluginData(SNAPSHOT_KEY, '');
}

// ── manifest (clientStorage) helpers ───────────────────────────────────────────
async function readManifest(): Promise<Manifest> {
	const raw = (await figma.clientStorage.getAsync(MANIFEST_KEY)) as Manifest | undefined;
	return raw ?? {};
}

async function writeManifest(manifest: Manifest): Promise<void> {
	await figma.clientStorage.setAsync(MANIFEST_KEY, manifest);
}

async function removeManifestEntries(nodeIds: readonly string[]): Promise<void> {
	const manifest = await readManifest();
	await writeManifest(removeFromManifest(manifest, nodeIds));
}

// ── withSnapshot (the guarded batch apply) ─────────────────────────────────────
/** Guarded batch: eligibility gate → ensureFontsLoaded → durable capture → mutate. ONE manifest
 *  read-modify-write per batch, written BEFORE the first mutation. On ANY failure the batch is
 *  all-or-nothing: every node already captured/mutated is restored and its durable record cleared
 *  before returning (Design model §5). */
export async function withSnapshot<T extends SceneNode>(
	nodes: readonly T[],
	op: MutationOp,
	mutate: (node: T) => Promise<void>,
): Promise<BatchResult> {
	const result: BatchResult = { succeeded: [], blocked: [], failed: [] };

	// 1. Eligibility gate — ineligible nodes are blocked up front and never touched (Design model §4).
	const eligible: T[] = [];
	for (const node of nodes) {
		const reason = mutationBlockReason(eligibilityFlagsOf(node), op);
		if (reason !== null) result.blocked.push({ nodeId: node.id, reason });
		else eligible.push(node);
	}
	if (eligible.length === 0) return result;

	const capturedAt = Date.now();
	const captured: { node: T; snapshot: NodeSnapshot }[] = [];
	const delta: Manifest = {};
	let failingNodeId: string | undefined;

	try {
		// 2. Durable capture per node: fonts → serialize → guard size → setPluginData → manifest delta.
		for (const node of eligible) {
			failingNodeId = node.id;
			if (node.type === 'TEXT') await ensureFontsLoaded(node);
			const snapshot = captureSnapshot(node, op, capturedAt);
			const json = serializeSnapshot(snapshot);
			if (json.length > SNAPSHOT_MAX_BYTES) {
				throw new SnapshotError(
					'PERSIST_FAILED',
					node.id,
					`Snapshot ${json.length}B exceeds the ${SNAPSHOT_MAX_BYTES}B cap`,
				);
			}
			node.setPluginData(SNAPSHOT_KEY, json);
			delta[node.id] = { op, capturedAt };
			captured.push({ node, snapshot });
		}

		// 3. ONE manifest read-modify-write for the whole batch — BEFORE the first mutation.
		failingNodeId = undefined;
		const manifest = await readManifest();
		await writeManifest(mergeManifest(manifest, delta));

		// 4. Mutate the batch; register each live ref for the close handler as it succeeds.
		for (const entry of captured) {
			failingNodeId = entry.node.id;
			await mutate(entry.node);
			liveMutations.set(entry.node.id, entry);
			result.succeeded.push(entry.node.id);
		}

		// 5. One undo checkpoint for the whole batch (Resolved Defaults §4).
		figma.commitUndo();
		return result;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const culpritId = err instanceof SnapshotError ? err.nodeId : failingNodeId;
		await rollbackBatch(captured, culpritId, message, result);
		return result;
	}
}

/** All-or-nothing rollback: restore + clear the durable record for every captured node, then one
 *  manifest write to drop them all. Fonts were already loaded during capture, so the restore is a
 *  synchronous best-effort; a failure here leaves the durable snapshot for restore-on-launch. */
async function rollbackBatch(
	captured: readonly { node: SceneNode; snapshot: NodeSnapshot }[],
	culpritId: string | undefined,
	message: string,
	result: BatchResult,
): Promise<void> {
	result.succeeded = []; // nothing survives a rolled-back batch
	const capturedIds = new Set(captured.map((entry) => entry.node.id));
	for (const { node, snapshot } of captured) {
		try {
			applyRestorePlan(node, planRestore(snapshot, { inInstance: isInsideInstance(node) }));
			node.setPluginData(SNAPSHOT_KEY, '');
		} catch (restoreErr) {
			console.warn(`[snapshot] rollback failed for ${node.id}: ${String(restoreErr)}`);
		}
		liveMutations.delete(node.id);
		result.failed.push({ nodeId: node.id, error: node.id === culpritId ? message : `rolled back: ${message}` });
	}
	// The node that actually failed may have thrown before it was captured — still report it.
	if (culpritId !== undefined && !capturedIds.has(culpritId)) {
		result.failed.push({ nodeId: culpritId, error: message });
	}
	await removeManifestEntries(captured.map((entry) => entry.node.id));
}

// ── restore ────────────────────────────────────────────────────────────────────
/** Restores one node from its durable snapshot in the per-mode order (Resolved Defaults §3), then
 *  clears its pluginData entry and manifest entry. Idempotent: no snapshot → no-op. */
export async function restoreNode(nodeId: string): Promise<RestoreResult> {
	const node = await figma.getNodeByIdAsync(nodeId);
	if (!isRestorable(node)) {
		// Deleted or retyped (Resolved Defaults §6) — drop the manifest entry, never throw.
		await removeManifestEntries([nodeId]);
		liveMutations.delete(nodeId);
		return { nodeId, restored: false, reason: 'NODE_GONE' };
	}
	const snapshot = readSnapshot(node);
	if (snapshot === null) {
		await removeManifestEntries([nodeId]);
		liveMutations.delete(nodeId);
		return { nodeId, restored: false };
	}
	try {
		await restoreNodeProperties(node, snapshot);
	} catch (err) {
		if (err instanceof SnapshotError && err.code === 'RESTORE_FAILED') {
			// Keep snapshot + manifest so restore-on-launch retries on a machine that has the font (§5).
			return { nodeId, restored: false, reason: 'RESTORE_FAILED' };
		}
		throw err;
	}
	await removeManifestEntries([nodeId]);
	liveMutations.delete(nodeId);
	figma.commitUndo(); // each discrete restore is one undo step (Resolved Defaults §4)
	return { nodeId, restored: true };
}

/** Restores every node id in the manifest, whatever op put it there. This is the restore-on-launch
 *  path (main.ts, before any handler registration), where being op-blind is the point: a manifest
 *  left behind by a prior session must be healed in full.
 *
 *  **Not the path a feature's Revert should take** — see `restoreByOp`. */
export async function restoreAll(): Promise<BatchResult> {
	const manifest = await readManifest();
	return restoreIds(manifest, Object.keys(manifest));
}

/**
 * Restores only the nodes a given op mutated (LS-10 §1.2).
 *
 * A feature's Revert must not tear down another feature's work: `revert-pseudoloc` reverting an
 * active preview or RTL mirror would be a silent cross-feature side effect. The manifest already
 * records `{ op, capturedAt }` per node, so this filters data that is already there rather than
 * adding bookkeeping. Entries belonging to other ops are left in the manifest untouched.
 */
export async function restoreByOp(op: MutationOp): Promise<BatchResult> {
	const manifest = await readManifest();
	const nodeIds = Object.keys(manifest).filter((nodeId) => manifest[nodeId]?.op === op);
	return restoreIds(manifest, nodeIds);
}

/** The shared restore body. `manifest` is read once by the caller; only `nodeIds` are touched, and
 *  the single closing write drops exactly those that no longer need an entry. */
async function restoreIds(manifest: Manifest, nodeIds: readonly string[]): Promise<BatchResult> {
	const result: BatchResult = { succeeded: [], blocked: [], failed: [] };
	if (nodeIds.length === 0) return result;

	const toRemove: string[] = [];
	let anyRestored = false;

	for (const nodeId of nodeIds) {
		const node = await figma.getNodeByIdAsync(nodeId);
		if (!isRestorable(node)) {
			toRemove.push(nodeId); // NODE_GONE (§6) — drop silently; not a failure
			liveMutations.delete(nodeId);
			continue;
		}
		const snapshot = readSnapshot(node);
		if (snapshot === null) {
			toRemove.push(nodeId); // no durable snapshot — idempotent no-op
			liveMutations.delete(nodeId);
			continue;
		}
		try {
			await restoreNodeProperties(node, snapshot);
			toRemove.push(nodeId);
			liveMutations.delete(nodeId);
			result.succeeded.push(nodeId);
			anyRestored = true;
		} catch (err) {
			// RESTORE_FAILED (font unavailable, §5) or an unexpected error: KEEP the entry so a future
			// launch can retry rather than silently drop a node still in its mutated state.
			result.failed.push({ nodeId, error: err instanceof Error ? err.message : String(err) });
		}
	}

	await writeManifest(removeFromManifest(manifest, toRemove)); // one durable write for the batch
	if (anyRestored) figma.commitUndo(); // Revert / restore-on-launch is one undo step
	return result;
}

// ── close handler ──────────────────────────────────────────────────────────────
/** Registers the synchronous best-effort close handler over this session's in-memory refs. NOT the
 *  safety guarantee (Design model §3) — figma.on('close') runs sync-only and is not guaranteed to
 *  fire on every teardown path. Fonts are already loaded from apply, so the restore is a sync
 *  property write; durable cleanup is deferred to restore-on-launch. Failures are swallowed. */
export function registerCloseHandler(): void {
	figma.on('close', () => {
		for (const { node, snapshot } of liveMutations.values()) {
			try {
				applyRestorePlan(node, planRestore(snapshot, { inInstance: isInsideInstance(node) }));
			} catch {
				// best-effort only — restore-on-launch is the durable recovery path
			}
		}
		liveMutations.clear();
	});
}
