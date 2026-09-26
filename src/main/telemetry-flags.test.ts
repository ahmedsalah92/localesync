// src/main/telemetry-flags.test.ts — pure (no figma).
import { describe, expect, it } from 'vitest';
import { TELEMETRY_KEY, parseTelemetryFlags } from './telemetry-flags';

describe('parseTelemetryFlags — clientStorage is a cache', () => {
	it('reads stored flags', () => {
		expect(parseTelemetryFlags({ installed: true, firstScanDone: false })).toEqual({
			installed: true,
			firstScanDone: false,
		});
	});

	it.each([undefined, null, 'x', 3, { installed: 'yes' }, { firstScanDone: 1 }])(
		'reads %j as a fresh user',
		(raw) => {
			expect(parseTelemetryFlags(raw)).toEqual({ installed: false, firstScanDone: false });
		},
	);

	it('uses the versioned key', () => {
		expect(TELEMETRY_KEY).toBe('localesync:telemetry:v1');
	});
});
