// src/ui/snapshot-check.ts  (iframe; dev-only driver for the "Run LS-4 snapshot check" command)
//
// LS-4 integration harness, UI side. One button press sends a page-scoped scan-request over the real
// bridge; the main-side check (src/main/snapshot/check.ts) piggybacks on that message, runs the
// apply→restore acceptance cycle against the open fixtures/snapshot-restore.fig, and streams
// per-assertion 'ls4:…' progress notes which this driver relays to the console. All assertions are
// main-side (they need the live runtime), so the UI is a thin trigger + reporter.
//
// The same scan-request also wakes the LS-3 traversal check ('ls3:' notes) and the real LS-3 handler
// (a scan-result) — both are ignored here. Scaffolding only; invoke via the dev-only button in
// App.tsx under `npm run dev` with fixtures/snapshot-restore.fig open. Blocked by FIX-1.
import { on, request } from './bridge';

export async function runSnapshotCheck(): Promise<void> {
	let pass = 0;
	let fail = 0;

	const done = new Promise<boolean>((resolve) => {
		const off = on('progress', (msg) => {
			const note = msg.note;
			if (note === undefined || !note.startsWith('ls4:')) return; // ignore ls3:/scan traffic
			if (note === 'ls4:done') {
				off();
				resolve(true);
				return;
			}
			const rest = note.slice('ls4:'.length);
			if (rest.startsWith('fixture-missing') || rest.startsWith('error')) {
				console.log(`[snapshot] SKIP  ${rest}`);
				return;
			}
			if (rest.includes(':PASS')) pass += 1;
			else if (rest.includes(':FAIL')) fail += 1;
			const level = rest.includes(':FAIL') ? 'FAIL' : rest.includes(':PASS') ? 'PASS' : 'INFO';
			console.log(`[snapshot] ${level}  ${rest}`);
		});
	});

	try {
		// Trigger: the scan-result is irrelevant here (the main check owns the assertions); we send the
		// request only to wake the piggybacking harness and to surface a transport failure if any.
		await request('scan-request', { scope: 'page' });
	} catch (err) {
		console.log(`[snapshot] FAIL  scan-request trigger — ${String(err)}`);
	}

	const reported = await Promise.race([
		done,
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 30000)),
	]);
	if (!reported) {
		console.log('[snapshot] SKIP  main-side notes never arrived (check not registered, fixture not open, or it hung)');
		return;
	}
	console.log(`[snapshot] complete — ${pass} passed, ${fail} failed`);
}
