// src/main/telemetry.ts — LS-13 main-thread handlers: the waitlist handoff and first-run flags.
//
// Telemetry is best-effort (spec §1.5): a clientStorage failure never surfaces as an error the UI
// must handle. The one real failure — openExternal throwing — answers `internal`.
import { waitlistUrl } from '../common/pro';
import { on, respond, send } from './bridge';
import { TELEMETRY_KEY, parseTelemetryFlags, type TelemetryFlags } from './telemetry-flags';

async function readFlags(): Promise<TelemetryFlags> {
	try {
		return parseTelemetryFlags(await figma.clientStorage.getAsync(TELEMETRY_KEY));
	} catch {
		return { installed: false, firstScanDone: false };
	}
}

async function writeFlags(flags: TelemetryFlags): Promise<void> {
	try {
		await figma.clientStorage.setAsync(TELEMETRY_KEY, flags);
	} catch (err) {
		if (import.meta.env.DEV) {
			console.warn(`[telemetry] flags not saved: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

export function registerTelemetry(): void {
	on('telemetry-state-request', (msg) => {
		void (async () => {
			const flags = await readFlags();
			if (!flags.installed) await writeFlags({ ...flags, installed: true });
			respond<'telemetry-state-request'>(msg.id, {
				type: 'telemetry-state',
				firstLaunch: !flags.installed,
				firstScanDone: flags.firstScanDone,
			});
		})();
	});

	on('telemetry-mark', (msg) => {
		void (async () => {
			const flags = await readFlags();
			await writeFlags({ ...flags, firstScanDone: true });
			send({ type: 'progress', id: msg.id, completed: 1, total: 1 });
		})();
	});

	on('open-waitlist', (msg) => {
		try {
			figma.openExternal(waitlistUrl(msg.pillar));
			send({ type: 'progress', id: msg.id, completed: 1, total: 1 });
		} catch (err) {
			send({
				type: 'error',
				id: msg.id,
				code: 'internal',
				severity: 'error',
				message: `Couldn't open the waitlist: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
}
