import { applyBatchLeave } from './devtools/applyBatchLeave';
import { generateLargeFile } from './devtools/generateLargeFile';
import { generateOverflowSpike } from './devtools/generateOverflowSpike';
import { generateSnapshotRestore } from './devtools/generateSnapshotRestore';
import { registerOverflow } from './overflow';
import { registerOverflowCheck } from './overflow/check';
import { registerRoundtrip } from './roundtrip';
import { registerCloseHandler, restoreAll } from './snapshot';
import { registerSnapshotCheck } from './snapshot/check';
import { registerTraversal } from './traversal';
import { registerTraversalCheck } from './traversal/check';

export default async function () {
	figma.showUI(__html__, { width: 300, height: 260, themeColors: true });

	// LS-4 safety guarantee: restore-on-launch. A non-empty mutation manifest means a previous
	// session ended mid-mutation — heal it BEFORE any handler can start a new one (Design model §3).
	// Guarded so a restore failure can never brick launch.
	try {
		await restoreAll();
	} catch (err) {
		console.warn(`[snapshot] restore-on-launch failed: ${err instanceof Error ? err.message : String(err)}`);
	}
	// Best-effort synchronous close handler — a fast path, NOT the safety guarantee.
	registerCloseHandler();

	// LS-3: the real scan-request handler (traverse → ScannedTextNode projection).
	registerTraversal();
	// LS-8: the real overflow-scan-request + select-node handlers (scan → clone-measure → verdicts).
	registerOverflow();
	// LS-2 dev scaffold: transport round-trip handlers for the remaining message types. Idle until
	// the UI's dev-only __test:roundtrip button drives them; scan-request is owned by LS-3 and
	// overflow-scan-request/select-node by LS-8 above.
	registerRoundtrip();
	// Dev scaffolds, dev builds only (Vite strips these branches): LS-3 kitchen-sink golden checks,
	// the LS-4 snapshot apply→restore acceptance cycle (both piggyback on page scan-request), and
	// the LS-8 overflow acceptance passes (piggybacks on page overflow-scan-request + select-node).
	if (import.meta.env.DEV) {
		registerTraversalCheck();
		registerSnapshotCheck();
		registerOverflowCheck();

		// Dev-only harness hooks. bridge.ts claims the single `figma.ui.onmessage` slot at module load
		// (before this function body runs), so we wrap it here: intercept the `__dev:` sentinels, then
		// delegate everything else to the bridge. This avoids minting real message types for dev
		// scaffolding — the union is guarded by messages.test.ts, and the bridge would drop these
		// sentinels as non-conforming anyway. The `__dev:` prefix marks scaffolding Vite strips from
		// production builds.
		const bridgeHandler = figma.ui.onmessage;
		figma.ui.onmessage = (message: unknown, props) => {
			const devType =
				typeof message === 'object' && message !== null ? (message as { type?: unknown }).type : undefined;

			if (devType === '__dev:generate-snapshot-restore') {
				void generateSnapshotRestore()
					.then((report) => {
						console.log(`[dev] generateSnapshotRestore: created ${report.created.length} node(s)`, report.created);
						console.log('[dev] manual steps remaining:', report.manualSteps);
					})
					.catch((err: unknown) => {
						console.error(
							`[dev] generateSnapshotRestore failed: ${err instanceof Error ? err.message : String(err)}`,
						);
					});
				return;
			}

			if (devType === '__dev:generate-overflow-spike') {
				void generateOverflowSpike()
					.then((report) => {
						console.log(`[dev] generateOverflowSpike: created ${report.created.length} node(s)`, report.created);
						console.log('[dev] manual steps remaining:', report.manualSteps);
					})
					.catch((err: unknown) => {
						console.error(
							`[dev] generateOverflowSpike failed: ${err instanceof Error ? err.message : String(err)}`,
						);
					});
				return;
			}

			if (devType === '__dev:generate-large-file') {
				void generateLargeFile()
					.then((report) => {
						console.log(
							`[dev] generateLargeFile: ${report.totalTextNodes} text nodes across ${report.frames} frames + ${report.instances} instances. Save as fixtures/large-file.fig.`,
						);
					})
					.catch((err: unknown) => {
						console.error(`[dev] generateLargeFile failed: ${err instanceof Error ? err.message : String(err)}`);
					});
				return;
			}

			if (devType === '__dev:apply-batch-leave') {
				void applyBatchLeave()
					.then((batch) => {
						console.log(
							`[dev] applyBatchLeave: applied ${batch.succeeded.length} node(s) (left on canvas), blocked ${batch.blocked.length}, failed ${batch.failed.length}. ` +
								'Now press Cmd-Z ONCE — the whole batch should revert as a single undo step. Reload the plugin to clear the durable record before saving.',
						);
					})
					.catch((err: unknown) => {
						console.error(`[dev] applyBatchLeave failed: ${err instanceof Error ? err.message : String(err)}`);
					});
				return;
			}

			bridgeHandler?.(message, props);
		};
	}
}
