// src/common/roundtrip.test.ts — which traffic the dev-only LS-2 round-trip scaffold may answer.
import { describe, expect, it } from 'vitest';
import { ROUNDTRIP_ID_PREFIX, isRoundtripId } from './roundtrip';

describe('isRoundtripId', () => {
	it('accepts an id the round-trip driver minted', () => {
		expect(isRoundtripId(`${ROUNDTRIP_ID_PREFIX}0`)).toBe(true);
	});

	// The regression: the scaffold answered a real panel apply (`ui-N`) with a fake
	// `progress { completed: 1 }` before the real handler finished, so the RTL panel reported
	// "1 layer mirrored" and lost its review count and skipped groups (found in LS-28).
	it.each(['ui-0', 'ui-1a', 'main-3', '', 'xroundtrip-0'])('rejects real traffic id %j', (id) => {
		expect(isRoundtripId(id)).toBe(false);
	});
});
