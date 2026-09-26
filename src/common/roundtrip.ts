// src/common/roundtrip.ts
//
// The id namespace of the dev-only LS-2 round-trip scaffold (src/ui/roundtrip.ts drives it,
// src/main/roundtrip.ts answers it). Imported only by those two dev-only modules; the prefix
// contains `roundtrip`, which scripts/check-dist.mjs already rejects in dist/.
//
// Why it exists: the main bridge STACKS handlers per type, and in dev the scaffold's command
// handlers ran alongside the real LS-10/LS-11 ones. Answering synchronously, the scaffold sent a
// fake `progress { completed: 1 }` under a real apply's id before the real handler finished — the
// RTL panel then reported "1 layer mirrored" and lost its review count and skipped groups (found in
// LS-28). A non-matching command drew a fake `internal` error instead. The scaffold now answers
// only ids the driver minted.
//
// It also owns the scaffold's type lists (LS-31), derived from src/common/messages.ts rather than
// kept by hand: the driver's own copies omitted `rtl-flagged`, so main→UI conformance never
// covered it. Everything here is a function, never a module-level call, so a production bundle that
// reaches this module through main.ts still tree-shakes it away (see src/main/roundtrip.ts).
import type { MainToUi, RequestResponse, UiToMain } from './messages';
import { mainToUiTypes } from './messages';
import { fixtures } from './messages.fixtures';

export const ROUNDTRIP_ID_PREFIX = 'roundtrip-';

export function isRoundtripId(id: string): boolean {
	return id.startsWith(ROUNDTRIP_ID_PREFIX);
}

// Every UiToMain type that is a command: the union minus the `RequestResponse` keys. A `Record`
// over that set, so a new command type is a compile error here until someone decides whether the
// scaffold probes it — it cannot be silently missed. `false` marks commands the scaffold must NOT
// answer because a real handler owns their observable behaviour (an answer would race it).
// Key order is the send order; main emits the main→UI fixtures on receipt of the last probed one.
type CommandType = Exclude<UiToMain['type'], keyof RequestResponse>;
const PROBED_COMMANDS: Record<CommandType, boolean> = {
	'apply-pseudoloc': true,
	'revert-pseudoloc': true,
	'apply-rtl-mirror': true,
	'revert-rtl-mirror': true,
	'apply-preview': true,
	'revert-preview': true,
	'preview-import': false, // real LS-12 handler writes the user's clientStorage; never probe it
	'preview-edit': false, // real LS-12 handler writes the store and the canvas
	'select-node': false, // real LS-8 handler: answers with a real `node-gone` or nothing
	'overflow-scan-cancel': false, // outcome is a scan's `stopped: true` result, not a reply
	'resize-window': false, // resizes the real plugin window; no reply at all
	'open-waitlist': false, // opens a real browser tab; never probe
	'telemetry-mark': false, // writes the user's clientStorage
};

/** The commands the driver sends and main's scaffold answers, in send order. */
export function roundtripCommandTypes(): CommandType[] {
	return (Object.keys(PROBED_COMMANDS) as CommandType[]).filter((type) => PROBED_COMMANDS[type]);
}

/** One canonical fixture per MainToUi type, for main to echo verbatim and the UI to deep-equal. */
export function mainToUiFixtures(): MainToUi[] {
	return mainToUiTypes().map((type) => {
		const matching = fixtures.filter((m) => m.type === type);
		if (matching.length !== 1) throw new Error(`roundtrip: ${matching.length} fixtures for ${type}`);
		return matching[0] as MainToUi;
	});
}
