// src/main/telemetry-flags.test.ts — pure (no figma).
import { describe, expect, it } from 'vitest';
import { TELEMETRY_KEY, launchState, parseTelemetryFlags } from './telemetry-flags';

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

describe('launchState — install fires exactly once', () => {
	it('reports a first launch and marks the plugin installed', () => {
		expect(launchState({ installed: false, firstScanDone: false })).toEqual({
			firstLaunch: true,
			write: { installed: true, firstScanDone: false },
		});
	});

	it('reports a later launch and writes nothing', () => {
		expect(launchState({ installed: true, firstScanDone: true })).toEqual({ firstLaunch: false, write: null });
	});
});
