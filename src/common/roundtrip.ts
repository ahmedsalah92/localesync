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

export const ROUNDTRIP_ID_PREFIX = 'roundtrip-';

export function isRoundtripId(id: string): boolean {
	return id.startsWith(ROUNDTRIP_ID_PREFIX);
}
