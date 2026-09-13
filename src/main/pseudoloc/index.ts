// src/main/pseudoloc/index.ts  (main thread; uses the `figma` global)
//
// LS-10 public API: apply and revert the pseudo-loc transform on canvas.
//
// This is the first PRODUCTION caller of LS-4's withSnapshot — until LS-10 only the LS-4 harness
// and a devtool called it, which is why both LS-4 amendments (spec §1.2) landed alongside this.
//
// The transform itself is NOT here: `transform` lives in `src/common/pseudoloc` so both threads can
// import it — main applies it to canvas, the UI runs the same function to preview rows (LS-8 §1's
// one-implementation rule). This module is the canvas side: scope resolution, the guarded batch,
// and the message handlers.
import type { ScanScope } from '../../common/messages';
import type { PseudoLocOptions } from '../../common/models';
import { on, send } from '../bridge';
import { transform } from '../../common/pseudoloc';
import { restoreByOp, withSnapshot } from '../snapshot';
import type { BatchResult } from '../snapshot';
import { collectTextNodes } from '../traversal';

const OP = 'pseudoloc' as const;

/**
 * §2.5 — scope is selection-preferred and resolved HERE, not in the UI: the selection lives on the
 * main thread, so the panel cannot know whether one exists. The wire field carries the intent.
 *
 * Resolved by checking `selection.length` rather than by calling `collectTextNodes('selection')`
 * and catching `NoSelectionError`: that exception is LS-3's signal for a user-visible empty-selection
 * state, not a control-flow branch — and because this downgrades, the panel never reaches that state.
 */
function resolveScope(intent: ScanScope): ScanScope {
	if (intent === 'page') return 'page';
	return figma.currentPage.selection.length > 0 ? 'selection' : 'page';
}

/**
 * Apply the transform to every eligible text node in scope.
 *
 * **Restores first (§2.7).** Re-applying with new options must expand the ORIGINAL, not the already
 * padded text — `+40%` then `+50%` is a 50% expansion of the source, never 50% of 140%. This is
 * also what makes LS-4's new `already-mutated` block a skip rather than a hard failure: by the time
 * withSnapshot runs there is nothing left holding a snapshot, so the guard only fires for paths that
 * bypass this function.
 */
export async function applyPseudoLoc(intent: ScanScope, options: PseudoLocOptions): Promise<BatchResult> {
	// dynamic-page: findAllWithCriteria throws on an unloaded page (agent-guidelines §2).
	await figma.currentPage.loadAsync();
	await restoreByOp(OP);

	const nodes = collectTextNodes(resolveScope(intent));
	// `node.characters` is still the original here: withSnapshot captures before it calls mutate.
	return withSnapshot(nodes, OP, (node) => {
		node.characters = transform(node.characters, options);
		return Promise.resolve();
	});
}

/** Revert only this op's nodes, leaving an active preview or RTL mirror alone (§2.8). */
export async function revertPseudoLoc(): Promise<BatchResult> {
	return restoreByOp(OP);
}

/**
 * Both messages are COMMANDS, not requests — neither appears in `RequestResponse`, so per LS-2 the
 * outcome is reported on `progress`/`error`, correlated by id. The mapping this module uses:
 *
 * | outcome | message |
 * |---|---|
 * | nothing in scope | `error` `no-text-nodes` (severity error) |
 * | batch rolled back | `error` `mutation-failed` (severity error) |
 * | some nodes skipped | `error` `nodes-blocked` (severity **warning**) carrying `blocked[]` |
 * | done | terminal `progress` with `completed`/`total` |
 *
 * The blocked warning is sent BEFORE the terminal progress so that a panel treating progress as
 * "finished" already holds the skip list when it renders.
 */
export function registerPseudoLoc(): void {
	on('apply-pseudoloc', (msg) => {
		void (async () => {
			try {
				const batch = await applyPseudoLoc(msg.scope, msg.options);

				if (batch.failed.length > 0) {
					send({
						type: 'error',
						id: msg.id,
						code: 'mutation-failed',
						severity: 'error',
						message: 'The pseudo-loc transform failed and the canvas was restored.',
					});
					return;
				}

				if (batch.succeeded.length === 0 && batch.blocked.length === 0) {
					send({
						type: 'error',
						id: msg.id,
						code: 'no-text-nodes',
						severity: 'error',
						message: 'No eligible text layers in scope.',
					});
					return;
				}

				if (batch.blocked.length > 0) {
					send({
						type: 'error',
						id: msg.id,
						code: 'nodes-blocked',
						severity: 'warning',
						message: `${batch.blocked.length} layer(s) were skipped and flagged, not expanded.`,
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
					message: `Pseudo-loc failed: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		})();
	});

	on('revert-pseudoloc', (msg) => {
		void (async () => {
			try {
				const batch = await revertPseudoLoc();
				if (batch.failed.length > 0) {
					// A restore failure leaves the durable snapshot in place on purpose, so a later
					// restore-on-launch can retry rather than abandoning a node in its mutated state.
					send({
						type: 'error',
						id: msg.id,
						code: 'mutation-failed',
						severity: 'error',
						message: `${batch.failed.length} layer(s) could not be restored. They will be restored next time the plugin opens.`,
					});
					return;
				}
				send({ type: 'progress', id: msg.id, completed: batch.succeeded.length, total: batch.succeeded.length });
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
