// src/ui/telemetry.test.ts — the activation emitter (LS-13 §1.4). Pure; no bridge.
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { firstScanAction, markFirstScan, setFirstScanDone, track, type TelemetryEvent } from './telemetry';

describe('track', () => {
	it('hands the event to the sink exactly once', () => {
		const sink = vi.fn();
		track({ name: 'export_performed', format: 'json' }, sink);
		expect(sink).toHaveBeenCalledTimes(1);
		expect(sink).toHaveBeenCalledWith({ name: 'export_performed', format: 'json' });
	});

	it('carries only closed literal properties — no free text (no PII)', () => {
		expectTypeOf<Extract<TelemetryEvent, { name: 'pseudoloc_applied' }>['expansion']>().toEqualTypeOf<
			30 | 40 | 50
		>();
		expectTypeOf<Extract<TelemetryEvent, { name: 'export_performed' }>['format']>().toEqualTypeOf<
			'json' | 'ios' | 'android'
		>();
		expectTypeOf<Extract<TelemetryEvent, { name: 'preview_used' }>>().toEqualTypeOf<{ name: 'preview_used' }>();
	});
});

describe('first_scan — once, ever', () => {
	it('decides fire vs skip from the stored flag', () => {
		expect(firstScanAction(false)).toBe('fire');
		expect(firstScanAction(true)).toBe('skip');
	});

	// Review Focus 3 — two scans completing before main persists the flag still fire once.
	it('fires once across repeated completions and marks the main thread once', () => {
		setFirstScanDone(false);
		const sink = vi.fn();
		const mark = vi.fn();
		markFirstScan('overflow', { sink, mark });
		markFirstScan('extract', { sink, mark });
		expect(sink).toHaveBeenCalledTimes(1);
		expect(sink).toHaveBeenCalledWith({ name: 'first_scan', kind: 'overflow' });
		expect(mark).toHaveBeenCalledTimes(1);
	});

	it('never fires when the user already scanned in an earlier session', () => {
		setFirstScanDone(true);
		const sink = vi.fn();
		markFirstScan('extract', { sink, mark: vi.fn() });
		expect(sink).not.toHaveBeenCalled();
	});
});
