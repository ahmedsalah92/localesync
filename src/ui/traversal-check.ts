// src/ui/traversal-check.ts  (iframe; dev-only driver for the __test:traversal command)
//
// LS-3 integration harness, UI side. One button press:
//   1. sends a page-scoped scan-request over the real bridge — the LS-3 handler answers it, and
//      the main-side check (src/main/traversal/check.ts) piggybacks on the same message;
//   2. asserts the DTO-visible slice of the golden set on the scan-result (rows matched by
//      `characters` — fixture convention: each labelled node's characters equal its label; the
//      `empty` row is the single empty:true node);
//   3. relays the main-side per-label 'ls3:…' progress notes to the console;
//   4. after 'ls3:done' (the main check ends with the selection cleared), asserts the wire-level
//      no-selection error with a selection-scoped request.
//
// Scaffolding only — never run by Vitest (needs a real Figma runtime). Invoke via the dev-only
// button in App.tsx under `npm run dev` with fixtures/kitchen-sink.fig open.
import type { ScannedTextNode } from '../common/models';
import { on, request } from './bridge';

// The DTO-visible slice of the LS-3 spec §3 golden table (main-side-only fields — textAutoResize,
// truncation, bounds, fonts — are asserted by the main-side check, not here).
const dtoGolden: { label: string; expected: Partial<ScannedTextNode> }[] = [
	{
		label: 'auto-width',
		expected: {
			hasMissingFont: false,
			isMixedFont: false,
			inInstance: false,
			hidden: false,
			locked: false,
			empty: false,
		},
	},
	{ label: 'mixed-font', expected: { isMixedFont: true } },
	{ label: 'missing-font', expected: { hasMissingFont: true } },
	{ label: 'nested-instance', expected: { inInstance: true } },
	{ label: 'component-override', expected: { inInstance: true } },
	{ label: 'in-group', expected: {} }, // presence is the DTO-level assertion
	{ label: 'zero-size', expected: {} },
	{ label: 'hidden-self', expected: { hidden: true } },
	{ label: 'hidden-ancestor', expected: { hidden: true } },
	{ label: 'locked-ancestor', expected: { locked: true } },
];

export async function runTraversalCheck(): Promise<void> {
	let checks = 0;
	const log = (ok: boolean, label: string, detail = '') => {
		checks++;
		console.log(`[traversal] ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
	};

	// Subscribe before sending anything: main streams its notes while the scan is in flight.
	let fixtureMissing = false;
	const mainDone = new Promise<boolean>((resolve) => {
		const off = on('progress', (msg) => {
			const note = msg.note;
			if (note === undefined || !note.startsWith('ls3:')) return;
			if (note === 'ls3:done') {
				off();
				resolve(true);
				return;
			}
			const rest = note.slice('ls3:'.length);
			if (rest.startsWith('fixture-missing') || rest.startsWith('error')) {
				fixtureMissing = true;
				console.log(`[traversal] SKIP  ${rest}`);
				return;
			}
			const sep = rest.indexOf(':');
			if (sep === -1) {
				console.log(`[traversal] ${rest}`);
				return;
			}
			const label = rest.slice(0, sep);
			const outcome = rest.slice(sep + 1);
			if (outcome.startsWith('PASS')) log(true, `main ${label}`);
			else if (outcome.startsWith('FAIL')) log(false, `main ${label}`, outcome.slice('FAIL'.length).trim());
			else console.log(`[traversal] ${outcome}  — main ${label}`);
		});
	});

	// 1 + 2: page scan → DTO golden slice.
	try {
		const scan = await request('scan-request', { scope: 'page' });
		log(scan.type === 'scan-result', 'scan-request → scan-result');
		const rows = scan.nodes;
		if (rows.some((row) => row.characters === 'auto-width')) {
			for (const { label, expected } of dtoGolden) {
				const row = rows.find((r) => r.characters === label);
				if (!row) {
					log(false, `dto ${label}`, 'row missing from scan-result');
					continue;
				}
				const failures = Object.entries(expected)
					.filter(([key, want]) => row[key as keyof ScannedTextNode] !== want)
					.map(
						([key, want]) =>
							`${key}=${String(row[key as keyof ScannedTextNode])} (expected ${String(want)})`,
					);
				log(failures.length === 0, `dto ${label}`, failures.join('; '));
			}
			const emptyRows = rows.filter((row) => row.empty);
			log(emptyRows.length === 1 && emptyRows[0]?.characters === '', 'dto empty (single empty:true row)');
			log(
				rows.every((row) => row.containerLabel.split(' / ').length <= 3),
				'dto containerLabel depth cap 3',
			);
		} else {
			console.log('[traversal] SKIP  dto golden checks (kitchen-sink fixture not open)');
		}
	} catch (err) {
		log(false, 'scan-request', String(err));
	}

	// 3: wait for the main-side report (guarded — the check is only registered in dev builds).
	const reported = await Promise.race([
		mainDone,
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15000)),
	]);
	if (!reported) console.log('[traversal] SKIP  main-side notes never arrived (check not registered, or it hung)');

	// 4: wire-level no-selection error — valid only after the main check cleared the selection.
	if (reported && !fixtureMissing) {
		try {
			await request('scan-request', { scope: 'selection' });
			log(false, 'no-selection error', 'request resolved instead of rejecting');
		} catch (err) {
			const code = (err as { code?: unknown }).code;
			log(code === 'no-selection', 'no-selection error', `code=${String(code)}`);
		}
	}

	console.log(`[traversal] complete — ${checks} checks logged`);
}
