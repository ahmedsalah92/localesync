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

/**
 * What the launch-time state request answers, and the flags to save (null: nothing to save).
 * `install` fires exactly once: the launch that finds `installed` false is the one that sets it.
 * `null` flags mean the store could not be read: answer "not first, already scanned" and write
 * nothing, so an unreadable store suppresses both events rather than resetting them (LS-13 review).
 */
export function launchState(flags: TelemetryFlags | null): {
	firstLaunch: boolean;
	firstScanDone: boolean;
	write: TelemetryFlags | null;
} {
	if (flags === null) return { firstLaunch: false, firstScanDone: true, write: null };
	if (flags.installed) return { firstLaunch: false, firstScanDone: flags.firstScanDone, write: null };
	return { firstLaunch: true, firstScanDone: flags.firstScanDone, write: { ...flags, installed: true } };
}

/** The flags `telemetry-mark` saves — only over flags it could read (null: write nothing). */
export function markState(flags: TelemetryFlags | null): TelemetryFlags | null {
	return flags === null ? null : { ...flags, firstScanDone: true };
}
