// src/main/extract/index.ts  (main thread; uses the `figma` global)
//
// LS-9 public API: string extraction into a keyed list, with a stable key stamped on each node as
// plugin data so the same file yields the same keys across sessions. Walks the scope via LS-3's
// traverse(), resolves ownership (./resolve), stamps what needs stamping, and closes the pass with
// one commitUndo. Plugin data is inert — no layout, no font load — so the missing-font and
// mixed-font gates do not apply and nothing here goes through LS-4's withSnapshot (LS-9 §2.16).
import type { ScanScope } from '../../common/messages';
import type { BlockedNode, ExtractedString } from '../../common/models';
import { on, respond, send } from '../bridge';
import { collectTextNodes, NoSelectionError, traverse } from '../traversal';
import type { TextNodeModel } from '../traversal/model';
import { DEFAULT_SCHEME, type KeyScheme } from './key';
import { readStoredKey, writeStoredKey, type StoredKey } from './persist';
import { resolveKeys } from './resolve';

export { DEFAULT_SCHEME };
export type { KeyScheme };

const PROGRESS_EVERY = 25;

export interface ExtractOutcome {
	entries: ExtractedString[]; // document order
	blocked: BlockedNode[]; // rejected stamps, reason 'instance-locked'
}

/** Internal only — never crosses the bridge; `ExtractionRequest` carries `scope` alone. */
export interface ExtractOptions {
	/** Default true. False resolves keys exactly as a real pass would but writes nothing and commits
	 *  no undo step — for callers (the roundtrip harness) that must not stamp the user's file. */
	stamp?: boolean;
}

// Every pass runs to completion before the next starts. Two interleaved passes over the same nodes
// would each read the other's half-written stamps and resolve ownership against a moving target.
// The panel already disables Scan mid-pass; this covers everything else that can issue one (the
// dev harness, the roundtrip). Released in a `finally`, so a pass that throws cannot hold it.
let lock: Promise<void> = Promise.resolve();

async function runPass(
	scope: ScanScope,
	scheme: KeyScheme,
	onProgress: (completed: number, total: number) => void,
	stamp: boolean,
): Promise<ExtractOutcome> {
	const models = await traverse(scope);
	// Identical to the overflow scan's filter (rules 18–19): a page reporting different counts in two
	// tabs reads as a bug. Locked, missing-font, mixed-font, instance and master text all stay in.
	const eligible = models.filter((model) => !model.hidden && !model.empty);

	let completed = 0;
	let reported = 0;
	const tick = (): void => {
		if (completed === reported) return;
		reported = completed;
		onProgress(completed, eligible.length);
	};

	// getPluginData is a node method and traverse returns models by design, so every node is
	// re-fetched by its durable handle (rule 21). A node deleted mid-pass is dropped, as in LS-8.
	const live: { model: TextNodeModel; node: TextNode }[] = [];
	for (const model of eligible) {
		const node = await figma.getNodeByIdAsync(model.nodeId);
		if (node !== null && node.type === 'TEXT') live.push({ model, node });
		completed++;
		if (completed % PROGRESS_EVERY === 0) tick();
	}

	// Claims are read page-wide whatever the scope: scope controls what is returned, not what is
	// considered. Judged within a selection alone, a copy scanned without its original would take the
	// original's key, and a freshly derived key could collide with one a node outside the selection
	// already owns — a duplicate key in the export with nothing surfacing it. Out-of-scope nodes are
	// read here and never written. collectTextNodes, not traverse: reading a stamp needs none of
	// buildModel's upward walk, bounds or font reads. The page is loaded — traverse awaited it.
	const pageStamps = new Map<string, StoredKey | null>();
	for (const node of collectTextNodes('page')) pageStamps.set(node.id, readStoredKey(node));

	const resolutions = resolveKeys(
		live.map(({ model, node }) => ({
			nodeId: model.nodeId,
			name: model.name,
			ancestorFrameNames: model.ancestorFrameNames,
			stored: pageStamps.has(node.id) ? (pageStamps.get(node.id) ?? null) : readStoredKey(node),
		})),
		scheme,
		{ now: Date.now(), page: [...pageStamps].map(([nodeId, stored]) => ({ nodeId, stored })) },
	);

	const entries: ExtractedString[] = [];
	const blocked: BlockedNode[] = [];
	let wrote = false;
	resolutions.forEach((resolution, i) => {
		const item = live[i];
		if (item === undefined) return;
		if (stamp && resolution.write !== null) {
			// A rejected write keeps the derived key for this run and leaves the node unstamped; the
			// next pass simply tries again (rule 17).
			if (writeStoredKey(item.node, resolution.write)) wrote = true;
			else blocked.push({ nodeId: item.model.nodeId, reason: 'instance-locked' });
		}
		// Mixed-font nodes yield plain characters; per-run styling is not captured (rule 20).
		entries.push({
			key: resolution.key,
			nodeId: item.model.nodeId,
			value: item.model.characters,
			drifted: resolution.drifted,
		});
	});

	// One undo step for the whole batch, not one per node (rule 15). A pass that wrote nothing — every
	// rescan of an already-keyed file — leaves the undo stack alone.
	if (wrote) figma.commitUndo();

	// The final tick is what makes `completed` exact: the modulo guard alone never reports `30 of 30`
	// on a 30-node pass, and reports nothing at all under 25.
	tick();
	return { entries, blocked };
}

/** Walks `scope` via LS-3's traverse(), resolves ownership page-wide, derives keys for
 *  unstamped nodes, stamps them, and closes the pass with one figma.commitUndo().
 *  Rethrows NoSelectionError unchanged — LS-3 owns that mapping. */
export async function extractStrings(
	scope: ScanScope,
	scheme: KeyScheme,
	onProgress: (completed: number, total: number) => void,
	options: ExtractOptions = {},
): Promise<ExtractOutcome> {
	const previous = lock;
	let release = (): void => undefined;
	lock = new Promise<void>((resolve) => {
		release = resolve;
	});
	// `previous` never rejects: it is only ever a lock promise, resolved by the release below.
	await previous;
	try {
		return await runPass(scope, scheme, onProgress, options.stamp ?? true);
	} finally {
		release();
	}
}

/** Wires the extraction-request/extraction-result pair. Called once from main.ts,
 *  alongside registerTraversal(). */
export function registerExtraction(): void {
	on('extraction-request', (msg) => {
		void (async () => {
			try {
				// No scheme crosses the bridge — no selector ships in Phase 1 (LS-9 §1.1, §2.8).
				const outcome = await extractStrings(msg.scope, DEFAULT_SCHEME, (completed, total) => {
					send({ type: 'progress', id: msg.id, completed, total });
				});
				// Zero eligible nodes is a valid empty result, not an error (rule 25). Rejected stamps
				// ride the result itself (rule 17).
				respond<'extraction-request'>(msg.id, {
					type: 'extraction-result',
					entries: outcome.entries,
					blocked: outcome.blocked,
				});
			} catch (err) {
				if (err instanceof NoSelectionError) {
					send({ type: 'error', id: msg.id, code: 'no-selection', severity: 'error', message: err.message });
				} else {
					send({
						type: 'error',
						id: msg.id,
						code: 'internal',
						severity: 'error',
						message: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
					});
				}
			}
		})();
	});
}
