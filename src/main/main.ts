import { registerRoundtrip } from './roundtrip';
import { registerTraversal } from './traversal';
import { registerTraversalCheck } from './traversal/check';

export default function () {
	figma.showUI(__html__, { width: 300, height: 260, themeColors: true });
	// LS-3: the real scan-request handler (traverse → ScannedTextNode projection).
	registerTraversal();
	// LS-2 dev scaffold: transport round-trip handlers for the remaining message types. Idle until
	// the UI's dev-only __test:roundtrip button drives them; scan-request is owned by LS-3 above.
	registerRoundtrip();
	// LS-3 dev scaffold: kitchen-sink golden checks, dev builds only (Vite strips this branch).
	if (import.meta.env.DEV) registerTraversalCheck();
}
