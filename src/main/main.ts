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
	// LS-2 dev scaffold: transport round-trip handlers for the remaining message types. Idle until
	// the UI's dev-only __test:roundtrip button drives them; scan-request is owned by LS-3 above.
	registerRoundtrip();
	// Dev scaffolds, dev builds only (Vite strips these branches): LS-3 kitchen-sink golden checks
	// and the LS-4 snapshot apply→restore acceptance cycle. Both piggyback on page scan-request.
	if (import.meta.env.DEV) {
		registerTraversalCheck();
		registerSnapshotCheck();
	}
}
