import { clampWindowSize } from '../common/shell';
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
import { loadWindowSize, registerWindow, WINDOW_SIZE_KEY } from './window';

export default async function () {
	const windowSize = await loadWindowSize();
	if (import.meta.env.DEV) {
		console.log(`[ls21] launch | showUI receiving ${windowSize.width}x${windowSize.height}`);
	}

	// `title` is set explicitly rather than left to its plugin-name default: Figma's own window
	// title bar is the only place the product name and close control now live — the shell no
	// longer draws a duplicate Plugin Header band (docs/specs/LS-5.md §5.7).
	figma.showUI(__html__, { ...windowSize, themeColors: true, title: 'LocaleSync' });
	if (import.meta.env.DEV) {
		console.log('[ls21] launch | showUI returned');
	}

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
	registerWindow();
	// Dev scaffolds, dev builds only (Vite strips these branches): LS-3 kitchen-sink golden checks,
	// the LS-4 snapshot apply→restore acceptance cycle (both piggyback on page scan-request), and
	// the LS-8 overflow acceptance passes (piggybacks on page overflow-scan-request + select-node).
	if (import.meta.env.DEV) {
		let resizeProbeSequence = 0;
		// LS-2 transport round-trip scaffold, idle until the UI's dev-only __test:roundtrip button drives
		// it. Dev-only because bridge.ts STACKS handlers per type: in production a real handler would
		// run alongside the scaffold's, whose fixture match fails on every real message and answers the
		// live request id with an `internal` error — every real apply/revert (LS-10/11/12) would reject
		// while its mutation succeeded. In dev the two still coexist, so roundtrip.ts must keep excluding
		// every type a real handler owns (scan-request → LS-3, overflow-scan-request/select-node → LS-8).
		// scripts/check-dist.mjs fails the build if the scaffold or its fixtures reach dist/.
		registerRoundtrip();
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

			if (devType === '__dev:resize-probe') {
				const requested = { width: 100, height: 100 };
				void Promise.resolve()
					.then(() => {
						if (bridgeHandler === undefined) throw new Error('bridge handler unavailable');
						bridgeHandler(
							{
								type: 'resize-window',
								id: `__dev:resize-probe-${resizeProbeSequence++}`,
								...requested,
							},
							props,
						);
						return clampWindowSize(requested);
					})
					.then((clamped) => {
						console.log(`[ls21] probe | requested 100x100 | clamped ${clamped.width}x${clamped.height}`);
					})
					.catch((err: unknown) => {
						console.error(`[ls21] probe failed: ${err instanceof Error ? err.message : String(err)}`);
					});
				return;
			}

			if (devType === '__dev:resize-clear-size') {
				void figma.clientStorage
					.deleteAsync(WINDOW_SIZE_KEY)
					.then(() => {
						console.log('[ls21] cleared stored window size');
					})
					.catch((err: unknown) => {
						console.error(
							`[ls21] clear stored window size failed: ${err instanceof Error ? err.message : String(err)}`,
						);
					});
				return;
			}

			if (devType === '__dev:generate-snapshot-restore') {
				void generateSnapshotRestore()
					.then((report) => {
						console.log(
							`[dev] generateSnapshotRestore: created ${report.created.length} node(s)`,
							report.created,
						);
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
						console.log(
							`[dev] generateOverflowSpike: created ${report.created.length} node(s)`,
							report.created,
						);
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
						console.error(
							`[dev] generateLargeFile failed: ${err instanceof Error ? err.message : String(err)}`,
						);
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
						console.error(
							`[dev] applyBatchLeave failed: ${err instanceof Error ? err.message : String(err)}`,
						);
					});
				return;
			}

			bridgeHandler?.(message, props);
		};
	}
}
