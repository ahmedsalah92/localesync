// src/main/preview/index.ts — the Preview handlers (LS-12 §2.3).
//
// Apply restores first, so switching language re-applies from source and translations never stack.
// Undo steps come from the snapshot primitive, which commits once per withSnapshot / restoreNode /
// restoreByOp call; this module never calls figma.commitUndo() where one of those already did
// (plan ruling R1).
import type { ErrorCode } from '../../common/messages';
import type { BlockedNode, PreviewRow } from '../../common/models';
import { on, respond, send } from '../bridge';
import { readStoredKey } from '../extract/persist';
import { ensureFontsLoaded, restoreByOp, restoreNode, snapshotOp, withSnapshot, type BatchResult } from '../snapshot';
import { collectTextNodes } from '../traversal';
import { loadStore, saveStore } from './persist';
import { ownersOf, partitionOwners, planPreview, unmatchedKeys, withoutBlocked, type Owner } from './rows';
import { applyEdit, languagesOf, mergeImport, translationsFor } from './store';

const OP = 'preview' as const;

/** What the last successful apply wrote — enough to rebuild the rows after an edit without reading
 *  node text, which by then is the translation, not the source. */
interface Session {
	language: string;
	owners: Owner[];
	mutated: Set<string>;
	blocked: BlockedNode[];
}
let session: Session | null = null;

export type PreviewOutcome =
	| { kind: 'ok'; language: string; rows: PreviewRow[]; unmatched: string[]; blocked: BlockedNode[] }
	| { kind: 'error'; code: Extract<ErrorCode, 'no-text-nodes' | 'no-keys' | 'mutation-failed'>; message: string };

async function outcomeFor(s: Session): Promise<PreviewOutcome> {
	const translations = translationsFor(await loadStore(), s.language);
	const { rows } = planPreview(s.owners, translations);
	return {
		kind: 'ok',
		language: s.language,
		rows: withoutBlocked(rows, s.blocked),
		unmatched: unmatchedKeys(s.owners, translations),
		blocked: s.blocked,
	};
}

export async function applyPreview(language: string): Promise<PreviewOutcome> {
	await figma.currentPage.loadAsync();
	await restoreByOp(OP);
	session = null;
	const nodes = collectTextNodes('page');
	if (nodes.length === 0) return { kind: 'error', code: 'no-text-nodes', message: 'No text layers on this page.' };
	const owners = ownersOf(
		nodes.map((node) => ({ id: node.id, characters: node.characters, stored: readStoredKey(node) })),
	);
	if (owners.length === 0) return { kind: 'error', code: 'no-keys', message: 'No extracted strings on this page.' };

	// After Preview's own restore, a layer still owning a snapshot belongs to Pseudo-loc or RTL: its
	// text is theirs, not the source, so it is reported as skipped, never shown or written (LS-34).
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const { mine, foreign } = partitionOwners(
		owners,
		new Set(owners.filter((owner) => snapshotOp(byId.get(owner.nodeId) as TextNode) !== null).map((o) => o.nodeId)),
	);
	const foreignBlocked: BlockedNode[] = foreign.map((owner) => ({
		nodeId: owner.nodeId,
		reason: 'already-mutated',
		name: byId.get(owner.nodeId)?.name,
	}));

	const { targets } = planPreview(mine, translationsFor(await loadStore(), language));
	const values = new Map(targets.map((target) => [target.nodeId, target.value]));
	const batch = await withSnapshot(
		nodes.filter((node) => values.has(node.id)),
		OP,
		(node) => {
			node.characters = values.get(node.id) ?? node.characters;
			return Promise.resolve();
		},
	);
	if (batch.failed.length > 0) {
		return { kind: 'error', code: 'mutation-failed', message: 'The preview failed and the canvas was restored.' };
	}
	session = { language, owners, mutated: new Set(batch.succeeded), blocked: [...foreignBlocked, ...batch.blocked] };
	return outcomeFor(session);
}

/** Persists one edit. Throws when clientStorage refuses — the caller maps that to storage-failed. */
export async function saveEdit(language: string, key: string, value: string | null): Promise<void> {
	await saveStore(applyEdit(await loadStore(), language, key, value));
}

/** If that language is on the canvas, rewrites exactly one layer — one undo step (R1). */
export async function reapplyEdit(
	language: string,
	key: string,
	value: string | null,
): Promise<PreviewOutcome | 'saved'> {
	const s = session;
	if (s === null || s.language !== language) return 'saved';
	const owner = s.owners.find((o) => o.key === key);
	if (owner === undefined) return outcomeFor(s);

	const empty = value === null || value === '';
	if (empty) {
		// Only restore a snapshot that is Preview's own. After a Cmd-Z of the apply, another feature may
		// have mutated this layer since; restoring would tear down ITS snapshot (LS-34).
		const current = await figma.getNodeByIdAsync(owner.nodeId);
		const ours = current !== null && current.type === 'TEXT' && snapshotOp(current) === 'preview';
		if (s.mutated.has(owner.nodeId) && !ours) s.mutated.delete(owner.nodeId);
		if (s.mutated.has(owner.nodeId)) {
			const result = await restoreNode(owner.nodeId);
			// NODE_GONE (deleted) and "no durable snapshot" (reason undefined — already effectively
			// restored) both mean there is nothing left to track. RESTORE_FAILED (font unavailable) is
			// the one outcome that leaves the node still mutated: keep tracking it and report failure
			// rather than silently losing the source (Review Focus 5).
			if (result.restored || result.reason === 'NODE_GONE' || result.reason === undefined) {
				s.mutated.delete(owner.nodeId);
			} else {
				return { kind: 'error', code: 'mutation-failed', message: 'The layer could not be restored.' };
			}
		}
		return outcomeFor(s);
	}

	const node = await figma.getNodeByIdAsync(owner.nodeId);
	if (node?.type !== 'TEXT') return outcomeFor(s);

	// Direct-write is only safe when the node's own durable snapshot is still there to restore from
	// later. `s.mutated` alone is stale session bookkeeping — a user Cmd-Z between apply and this edit
	// can revert the mutation (and clear the node's snapshot pluginData) without this session hearing
	// about it, and a direct write onto that would overwrite the real source with no way back
	// (Review Focus 2). When the snapshot is gone, fall through to `withSnapshot`, whose
	// `already-mutated` eligibility gate recomputes fresh off the live node and is the real safety net.
	const canDirectWrite = s.mutated.has(owner.nodeId) && snapshotOp(node) === 'preview';
	if (canDirectWrite) {
		try {
			await ensureFontsLoaded(node);
		} catch {
			// Font went missing since the last apply/edit. Never let this reach `internal` — report it
			// through the normal blocked channel instead, and drop it from `mutated` since its text was
			// never written.
			s.blocked = [
				...s.blocked.filter((b) => b.nodeId !== owner.nodeId),
				{ nodeId: owner.nodeId, reason: 'missing-font', name: node.name },
			];
			s.mutated.delete(owner.nodeId);
			return outcomeFor(s);
		}
		node.characters = value;
		figma.commitUndo();
	} else {
		const batch = await withSnapshot([node], OP, (n) => {
			n.characters = value;
			return Promise.resolve();
		});
		if (batch.failed.length > 0) {
			return { kind: 'error', code: 'mutation-failed', message: 'The edit failed and the layer was restored.' };
		}
		for (const id of batch.succeeded) s.mutated.add(id);
		s.blocked = [...s.blocked.filter((b) => b.nodeId !== owner.nodeId), ...batch.blocked];
	}
	return outcomeFor(s);
}

/** Both halves, for the in-Figma harness. */
export async function editPreview(
	language: string,
	key: string,
	value: string | null,
): Promise<PreviewOutcome | 'saved'> {
	await saveEdit(language, key, value);
	return reapplyEdit(language, key, value);
}

export async function revertPreview(): Promise<BatchResult> {
	session = null;
	return restoreByOp(OP);
}

function reply(id: string, outcome: PreviewOutcome): void {
	if (outcome.kind === 'error') {
		send({ type: 'error', id, code: outcome.code, severity: 'error', message: outcome.message });
		return;
	}
	send({ type: 'preview-result', id, language: outcome.language, rows: outcome.rows, unmatched: outcome.unmatched });
	if (outcome.blocked.length > 0) {
		send({
			type: 'error',
			id,
			code: 'nodes-blocked',
			severity: 'warning',
			message: `${outcome.blocked.length} layer(s) were skipped and flagged, not previewed.`,
			blocked: outcome.blocked,
		});
	}
	send({ type: 'progress', id, completed: outcome.rows.length, total: outcome.rows.length + outcome.blocked.length });
}

function internal(id: string, what: string, err: unknown): void {
	send({
		type: 'error',
		id,
		code: 'internal',
		severity: 'error',
		message: `${what} failed: ${err instanceof Error ? err.message : String(err)}`,
	});
}

function storageFailed(id: string): void {
	send({
		type: 'error',
		id,
		code: 'storage-failed',
		severity: 'error',
		message: "Couldn't save — LocaleSync's storage is full or unavailable.",
	});
}

// A promise-chain mutex: every handler body below runs through `serial`, so the store's
// read-modify-write and the apply/edit canvas windows never interleave across two commands that
// arrived close together (Review Focus 3) — each runs to completion, in arrival order, before the
// next starts.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
	const run = queue.then(fn, fn);
	queue = run.catch(() => undefined);
	return run;
}

/** All four are COMMANDS except preview-state-request (a request, answered via `respond`). */
export function registerPreview(): void {
	on('preview-state-request', (msg) => {
		void serial(() =>
			loadStore()
				.then((store) => {
					respond<'preview-state-request'>(msg.id, { type: 'preview-state', languages: languagesOf(store) });
				})
				// Review Focus 1: an unhandled rejection here left the UI's request waiter hanging forever.
				.catch((err: unknown) => internal(msg.id, 'Preview state', err)),
		);
	});

	on('preview-import', (msg) => {
		void serial(async () => {
			try {
				await saveStore(mergeImport(await loadStore(), msg.maps));
			} catch {
				storageFailed(msg.id);
				return;
			}
			// Review Focus 4: re-applying the active language here could report a failure AFTER the
			// import already succeeded and was saved. Import only saves and answers progress; the panel
			// (Task 7) re-applies the active language itself when it was among the imported ones.
			send({ type: 'progress', id: msg.id, completed: msg.maps.length, total: msg.maps.length });
		});
	});

	on('apply-preview', (msg) => {
		void serial(() =>
			applyPreview(msg.language)
				.then((outcome) => reply(msg.id, outcome))
				.catch((err: unknown) => internal(msg.id, 'Preview', err)),
		);
	});

	on('preview-edit', (msg) => {
		void serial(async () => {
			try {
				await saveEdit(msg.language, msg.key, msg.value);
			} catch {
				storageFailed(msg.id); // nothing on the canvas changed
				return;
			}
			try {
				const outcome = await reapplyEdit(msg.language, msg.key, msg.value);
				if (outcome === 'saved') send({ type: 'progress', id: msg.id, completed: 1, total: 1 });
				else reply(msg.id, outcome);
			} catch (err) {
				internal(msg.id, 'Edit', err);
			}
		});
	});

	on('revert-preview', (msg) => {
		void serial(async () => {
			try {
				const batch = await revertPreview();
				if (batch.failed.length > 0) {
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
				internal(msg.id, 'Revert', err);
			}
		});
	});
}
