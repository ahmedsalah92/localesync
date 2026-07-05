import { registerRoundtrip } from './roundtrip';

export default function () {
	figma.showUI(__html__, { width: 300, height: 260, themeColors: true });
	// LS-2 dev scaffold: wire the transport round-trip handlers. Idle until the UI's dev-only
	// __test:roundtrip button drives them; superseded by real feature handlers in LS-3+.
	registerRoundtrip();
}
