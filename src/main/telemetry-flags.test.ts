// src/main/telemetry-flags.test.ts — pure (no figma).
import { describe, expect, it } from 'vitest';
import { TELEMETRY_KEY, launchState, markState, parseTelemetryFlags } from './telemetry-flags';

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
			firstScanDone: false,
			write: { installed: true, firstScanDone: false },
		});
	});

	it('reports a later launch and writes nothing', () => {
		expect(launchState({ installed: true, firstScanDone: true })).toEqual({
			firstLaunch: false,
			firstScanDone: true,
			write: null,
		});
	});
});

// LS-13 final review: a failed read used to look like a fresh user, so the launch wrote
// `firstScanDone: false` over a stored true — first_scan and install fired again.
describe('an unreadable store — suppress, never reset', () => {
	it('answers not-first-launch and first-scan-done, and writes nothing', () => {
		expect(launchState(null)).toEqual({ firstLaunch: false, firstScanDone: true, write: null });
	});

	it('marks first-scan only over flags it could read', () => {
		expect(markState(null)).toBeNull();
		expect(markState({ installed: true, firstScanDone: false })).toEqual({ installed: true, firstScanDone: true });
	});
});
