// src/ui/extract-check.ts  (iframe; dev-only driver for "Run LS-9 extract check")
//
// LS-9 integration harness, UI side (spec §3.3). One button press sends a genuine page-scoped
// extraction-request over the real bridge; registerExtraction answers it, and the main-side check
// (src/main/extract/check.ts) piggybacks on the same message and streams 'ls9:…' notes, which this
// driver relays to the console. Persistence and ownership need the live runtime, so nearly every
// assertion is main-side. This side asserts what only the wire result shows: the entry shape, and
// occurrenceCounts over the duplicate-value pair.
//
// Scaffolding only — never run by Vitest (needs a real Figma runtime). Invoke via the dev-only
// button under `npm run dev` with fixtures/extract-keys.fig open. It WRITES plugin data: never run it
// against kitchen-sink.fig (the main side refuses without the extract-keys sentinel row).
import type { ExtractedString } from '../common/models';
import { on, request } from './bridge';
import { occurrenceCounts } from './extract/state';

export async function runExtractCheck(): Promise<void> {
	let pass = 0;
	let fail = 0;
	const log = (ok: boolean, label: string, detail = '') => {
		if (ok) pass++;
		else fail++;
		console.log(`[extract] ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
	};

	// Subscribe before sending: main streams its notes after its own passes finish.
	const done = new Promise<boolean>((resolve) => {
		const off = on('progress', (msg) => {
			const note = msg.note;
			if (note === undefined || !note.startsWith('ls9:')) return;
			if (note === 'ls9:done') {
				off();
				resolve(true);
				return;
			}
			const rest = note.slice('ls9:'.length);
			if (rest.startsWith('fixture-missing') || rest.startsWith('error')) {
				console.log(`[extract] SKIP  ${rest}`);
				return;
			}
			if (rest.includes(':PASS')) pass++;
			else if (rest.includes(':FAIL')) fail++;
			const level = rest.includes(':FAIL') ? 'FAIL' : rest.includes(':PASS') ? 'PASS' : 'INFO';
			console.log(`[extract] ${level}  ${rest}`);
		});
	});

	let entries: ExtractedString[] = [];
	try {
		const result = await request('extraction-request', { scope: 'page' });
		log(result.type === 'extraction-result', 'extraction-request → extraction-result');
		entries = result.entries;
		log(
			Array.isArray(result.blocked) && result.blocked.every((b) => b.reason === 'instance-locked'),
			'blocked rides the result, every reason instance-locked',
			`${Array.isArray(result.blocked) ? result.blocked.length : 'no'} blocked`,
		);
	} catch (err) {
		log(false, 'extraction-request', String(err));
	}

	if (entries.length > 0) {
		log(
			entries.every((e) => typeof e.drifted === 'boolean' && e.key.length > 0 && e.value.length > 0),
			'every entry carries key, value and a boolean drifted',
		);
		log(new Set(entries.map((e) => e.key)).size === entries.length, 'every key is unique');

		const pair = entries.filter((e) => e.key.startsWith('duplicate_value.'));
		const counts = occurrenceCounts(entries);
		log(
			pair.length === 2 && pair.every((e) => counts.get(e.nodeId) === 2),
			'duplicate-value pair → occurrenceCounts 2 for both nodes',
			pair.map((e) => `${e.key}=${counts.get(e.nodeId)}`).join(', ') || 'pair not found',
		);
	}

	const reported = await Promise.race([
		done,
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 60000)),
	]);
	if (!reported) {
		console.log(
			'[extract] SKIP  main-side notes never arrived (check not registered, fixture not open, or it hung)',
		);
		return;
	}
	console.log(`[extract] complete — ${pass} passed, ${fail} failed`);
}
