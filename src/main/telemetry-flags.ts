// src/main/telemetry-flags.ts — first-run memory for LS-13's install / first_scan events. Pure.
export const TELEMETRY_KEY = 'localesync:telemetry:v1';

export interface TelemetryFlags {
	installed: boolean;
	firstScanDone: boolean;
}

/** Anything malformed reads as a fresh user: telemetry is best-effort and never throws. */
export function parseTelemetryFlags(raw: unknown): TelemetryFlags {
	if (typeof raw !== 'object' || raw === null) return { installed: false, firstScanDone: false };
	const { installed, firstScanDone } = raw as Record<string, unknown>;
	return { installed: installed === true, firstScanDone: firstScanDone === true };
}
