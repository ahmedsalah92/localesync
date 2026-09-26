// src/ui/telemetry.ts — LS-13 activation events (spec §1.4, §2.2).
//
// Every value is a closed literal: no keys, names, language codes or ids — no PII. Phase 1 sends
// to a console sink in dev and a no-op sink in production; a real collector is the SINK line (§2.5).
// No bridge import here: callers inject the main-thread mark, so this stays testable in plain Node.
export type TelemetryEvent =
	| { name: 'install' }
	| { name: 'first_scan'; kind: 'extract' | 'overflow' }
	| { name: 'overflow_scan_run'; scope: 'page' | 'selection' }
	| { name: 'pseudoloc_applied'; expansion: 30 | 40 | 50 }
	| { name: 'rtl_applied'; scope: 'page' | 'selection' }
	| { name: 'preview_used' }
	| { name: 'export_performed'; format: 'json' | 'ios' | 'android' };

export type Sink = (event: TelemetryEvent) => void;
export const noopSink: Sink = () => {};
export const consoleSink: Sink = (event) => console.log('[telemetry]', event);

/** THE one line to change for a real collector (spec §2.5). */
export const SINK: Sink = import.meta.env.DEV ? consoleSink : noopSink;

/** `sink` is a test seam only; call sites never pass it. */
export function track(event: TelemetryEvent, sink: Sink = SINK): void {
	sink(event);
}

// Until the launch-time state answers, assume done: never a false first_scan.
let firstScanDone = true;

/** Set from the launch-time `telemetry-state` answer. */
export function setFirstScanDone(done: boolean): void {
	firstScanDone = done;
}

export function firstScanAction(done: boolean): 'fire' | 'skip' {
	return done ? 'skip' : 'fire';
}

/** Fire `first_scan` once, ever: module state guards this session before main persists the mark. */
export function markFirstScan(kind: 'extract' | 'overflow', deps: { sink?: Sink; mark: () => void }): void {
	if (firstScanAction(firstScanDone) === 'skip') return;
	firstScanDone = true;
	track({ name: 'first_scan', kind }, deps.sink);
	deps.mark();
}
