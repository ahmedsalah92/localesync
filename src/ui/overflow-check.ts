// src/ui/overflow-check.ts  (iframe; dev-only driver for the LS-8 overflow check)
//
// LS-8 acceptance harness, UI side (spec §3). One button press:
//   1. sends a genuine page-scoped overflow-scan-request (['de']) over the real bridge — the LS-8
//      handler answers it (pass 2's real round trip), and the main-side check
//      (src/main/overflow/check.ts) piggybacks on the same message to run pass 1;
//   2. asserts the three pass-2 rows on the verdict array (matched by their authored `characters`
//      — see fixtures/overflow-spike.md) plus the self-sufficiency fields;
//   3. relays the main-side per-label 'ls8:…' progress notes to the console and awaits 'ls8:done';
//   4. re-requests with ['ja'] and asserts the refusal path (every row unmeasurable /
//      unsupported-language — the main check ignores unsupported-language requests);
//   5. pass 3: select-node on the first `overflows` row (selection asserted main-side, note
//      relayed here), then a fabricated id, asserting the correlated node-gone error.
//
// Scaffolding only — never run by Vitest (needs a real Figma runtime). Invoke via the dev-only
// button in App.tsx under `npm run dev` with fixtures/overflow-spike.fig open.
import type { SelectNode } from '../common/messages';
import type { OverflowReason, OverflowVerdict, OverflowVerdictValue } from '../common/models';
import { on, request, send } from './bridge';

// The pass-2 table: authored fixture characters → expected projection through the banded model.
const pass2Rows: {
	label: string;
	characters: string;
	verdict: OverflowVerdictValue;
	severity?: 'warn' | 'error';
	reason?: OverflowReason;
}[] = [
	{ label: 'fixed-fits', characters: 'Your changes have been saved automatically.', verdict: 'fits' },
	{
		label: 'fixed-overflows',
		characters: 'Save',
		verdict: 'overflows',
		severity: 'error',
		reason: 'exceeds-fixed-box',
	},
	{
		label: 'autoheight-maxlines',
		characters: 'Continue to checkout',
		verdict: 'truncates',
		severity: 'warn',
		reason: 'maxLines-cap',
	},
];

const timeout = <T>(ms: number, value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));

export async function runOverflowCheck(): Promise<void> {
	let checks = 0;
	const log = (ok: boolean, label: string, detail = '') => {
		checks++;
		console.log(`[overflow] ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
	};

	// Subscribe before sending anything: main streams its notes while the scan is in flight. The
	// subscription outlives 'ls8:done' — the select-node notes of pass 3 arrive later.
	let fixtureMissing = false;
	let resolveDone: (done: boolean) => void = () => undefined;
	const mainDone = new Promise<boolean>((resolve) => {
		resolveDone = resolve;
	});
	let selectNoteWaiter: ((outcome: string) => void) | undefined;
	const offProgress = on('progress', (msg) => {
		const note = msg.note;
		if (note === undefined || !note.startsWith('ls8:')) return;
		const rest = note.slice('ls8:'.length);
		if (rest === 'done') {
			resolveDone(true);
			return;
		}
		if (rest.startsWith('fixture-missing') || rest.startsWith('error')) {
			fixtureMissing = true;
			console.log(`[overflow] SKIP  ${rest}`);
			return;
		}
		if (rest.startsWith('select-node:')) {
			const outcome = rest.slice('select-node:'.length);
			if (selectNoteWaiter) {
				selectNoteWaiter(outcome);
				selectNoteWaiter = undefined;
			} else {
				console.log(`[overflow] ${outcome}  — select-node (unsolicited)`);
			}
			return;
		}
		const sep = rest.indexOf(':');
		if (sep === -1) {
			console.log(`[overflow] ${rest}`);
			return;
		}
		const label = rest.slice(0, sep);
		const outcome = rest.slice(sep + 1);
		if (outcome.startsWith('PASS')) log(true, `pass1 ${label}`);
		else if (outcome.startsWith('FAIL')) log(false, `pass1 ${label}`, outcome.slice('FAIL'.length).trim());
		else console.log(`[overflow] ${outcome}  — ${label}`);
	});

	try {
		// 1 + 2: the genuine de round trip (pass 2), which simultaneously wakes pass 1.
		let verdicts: OverflowVerdict[] = [];
		try {
			const result = await request('overflow-scan-request', { scope: 'page', targetLanguages: ['de'] });
			log(result.type === 'overflow-scan-result', 'overflow-scan-request → overflow-scan-result');
			verdicts = result.verdicts;
		} catch (err) {
			log(false, 'overflow-scan-request', String(err));
		}

		if (verdicts.some((v) => v.characters === pass2Rows[0]?.characters)) {
			for (const row of pass2Rows) {
				const verdict = verdicts.find((v) => v.characters === row.characters);
				if (!verdict) {
					log(false, `pass2 ${row.label}`, 'row missing — authored characters not set? see fixtures/overflow-spike.md');
					continue;
				}
				const failures: string[] = [];
				if (verdict.verdict !== row.verdict) {
					failures.push(`verdict=${verdict.verdict} (expected ${row.verdict})`);
				}
				if (verdict.severity !== row.severity) {
					failures.push(`severity=${String(verdict.severity)} (expected ${String(row.severity)})`);
				}
				if (row.reason !== undefined && verdict.reason !== row.reason) {
					failures.push(`reason=${String(verdict.reason)} (expected ${row.reason})`);
				}
				// Self-sufficiency fields (LS-8 §1): the row must render without a prior scan-result.
				if (verdict.language !== 'de') failures.push(`language=${verdict.language}`);
				if (verdict.candidate.length === 0) failures.push('candidate is empty');
				if (verdict.containerLabel.length === 0) failures.push('containerLabel is empty');
				if (verdict.measuredWidth <= 0 || verdict.measuredHeight <= 0) {
					failures.push(`measured=${verdict.measuredWidth}×${verdict.measuredHeight}`);
				}
				log(failures.length === 0, `pass2 ${row.label}`, failures.join('; '));
			}
		} else {
			console.log('[overflow] SKIP  pass2 rows (authored strings not found — see fixtures/overflow-spike.md)');
		}

		// 3: wait for the main-side pass-1 report before the refusal probe, so its clones are gone.
		const reported = await Promise.race([mainDone, timeout(30000, false)]);
		if (!reported) console.log('[overflow] SKIP  main-side notes never arrived (check not registered, or it hung)');

		// 4: the refusal path over the real wiring. The main-side check ignores this request.
		try {
			const refusal = await request('overflow-scan-request', { scope: 'page', targetLanguages: ['ja'] });
			const rows = refusal.verdicts;
			const allRefused =
				rows.length > 0 &&
				rows.every((v) => v.verdict === 'unmeasurable' && v.reason === 'unsupported-language' && v.candidate === '');
			log(allRefused, 'ja refusal: every row unmeasurable / unsupported-language', `rows=${rows.length}`);
			if (verdicts.length > 0) {
				log(
					rows.length === verdicts.length,
					'ja refusal row count matches the de scan',
					`${rows.length} vs ${verdicts.length}`,
				);
			}
		} catch (err) {
			log(false, 'ja refusal scan', String(err));
		}

		// 4b: pass 3 — magnitude, asserted over the real de scan (LS-8.2 §3.2). The per-row
		// re-derivation is main-side (it needs a constrained read); these are the field-level rules
		// that hold across every row the wire carried, plus the printed baseline.
		if (verdicts.length > 0) {
			const missing = verdicts.filter(
				(v) =>
					(v.verdict === 'overflows' || v.verdict === 'truncates') &&
					v.reason !== 'maxHeight-cap' &&
					v.overflowPx === undefined,
			);
			log(missing.length === 0, 'pass3 every flagged row carries overflowPx', missing.map((v) => v.characters).join('; '));

			const capped = verdicts.filter((v) => v.reason === 'maxHeight-cap' && v.overflowPx !== undefined);
			log(capped.length === 0, 'pass3 maxHeight-cap rows carry no delta', `${capped.length} violation(s)`);

			const unflagged = verdicts.filter(
				(v) => (v.verdict === 'fits' || v.verdict === 'unmeasurable') && v.overflowPx !== undefined,
			);
			log(unflagged.length === 0, 'pass3 no fits/unmeasurable row carries a delta', `${unflagged.length} violation(s)`);

			const nonPositive = verdicts.filter((v) => v.overflowPx !== undefined && !(v.overflowPx > 0));
			log(nonPositive.length === 0, 'pass3 every present overflowPx is > 0', `${nonPositive.length} violation(s)`);

			// LS-7's immediate-parent rule must survive the amendment.
			const hugPageParent = verdicts.find((v) => v.reason === 'no-container');
			if (hugPageParent) {
				log(
					hugPageParent.verdict === 'fits' && hugPageParent.overflowPx === undefined,
					'pass3 hug-page-parent stays fits/no-container with no delta',
					`verdict=${hugPageParent.verdict} px=${String(hugPageParent.overflowPx)}`,
				);
			}

			// The first-run baseline — copy this block into the PR description.
			console.log('[overflow] pass3 observed deltas:');
			for (const v of verdicts) {
				if (v.overflowPx === undefined) continue;
				console.log(
					`[overflow]   ${v.containerLabel} — ${v.verdict}/${v.reason ?? 'none'} ` +
						`${v.overflowPx.toFixed(2)}px (renders ${Math.ceil(v.overflowPx)}px) — "${v.characters}"`,
				);
			}
		}

		// 5: pass 4 — jump-to-node on a real row, then a fabricated id.
		const firstOverflow = verdicts.find((v) => v.verdict === 'overflows');
		if (!firstOverflow) {
			if (!fixtureMissing) log(false, 'select-node', 'no overflows row in the de scan to select');
		} else {
			const selectionNote = new Promise<string>((resolve) => {
				selectNoteWaiter = resolve;
			});
			send<SelectNode>({ type: 'select-node', nodeId: firstOverflow.nodeId });
			const outcome = await Promise.race([selectionNote, timeout(5000, '')]);
			if (outcome === '') log(false, 'select-node selection', 'main-side note never arrived');
			else log(outcome.startsWith('PASS'), 'select-node selection', outcome);
		}

		let fabricatedId = '';
		const goneCode = new Promise<string>((resolve) => {
			const offError = on('error', (msg) => {
				if (msg.id !== fabricatedId) return;
				offError();
				resolve(String(msg.code));
			});
		});
		fabricatedId = send<SelectNode>({ type: 'select-node', nodeId: '999:999999' });
		const code = await Promise.race([goneCode, timeout(5000, 'no error arrived')]);
		log(code === 'node-gone', 'select-node fabricated id → node-gone', `code=${code}`);
	} finally {
		offProgress();
	}

	console.log(`[overflow] complete — ${checks} checks logged`);
}

/**
 * The bridge regression (LS-8.2 §3.3), run separately against `fixtures/large-file.fig`.
 *
 * `request()` used to settle on any correlation-id match, so the first `progress` tick resolved the
 * scan promise with a ProgressMessage and the real result arrived to find nothing waiting. It
 * cannot be caught by Vitest — `bridge.ts` touches `window` at module scope and agent-guidelines §6
 * rules out jsdom — and it cannot be caught on `overflow-spike.fig` either: PROGRESS_EVERY is 25
 * and the spike has 14 rows, so it never reaches the first tick. That is precisely why the defect
 * went unnoticed. This needs a file of MORE than 25 nodes; large-file.fig has ~1500.
 *
 * It also exercises the streaming path end to end — partials must arrive, and their accumulated
 * count must reconcile with the final result.
 */
export async function runBridgeRegression(): Promise<void> {
	let checks = 0;
	const log = (ok: boolean, label: string, detail = '') => {
		checks++;
		console.log(`[bridge] ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
	};

	let ticks = 0;
	let streamed = 0;
	let lastTotal = 0;
	const offProgress = on('progress', (msg) => {
		if (msg.note !== undefined) return; // dev-harness notes, not scan progress
		ticks++;
		lastTotal = msg.total;
	});
	const offPartial = on('overflow-scan-partial', (msg) => {
		streamed += msg.verdicts.length;
	});

	try {
		const result = await request('overflow-scan-request', { scope: 'page', targetLanguages: ['de'] });

		// The assertion that would have failed before the fix: a settled promise carrying real rows.
		log(Array.isArray(result.verdicts), 'request() resolved with a verdicts array', typeof result.verdicts);
		log(result.verdicts.length > 0, 'verdicts is populated', `${result.verdicts.length} rows`);
		log(result.type === 'overflow-scan-result', 'settled on the result, not a progress tick', result.type);

		// Proof the file was big enough to trip the old defect.
		log(lastTotal > 25, 'the scan exceeded PROGRESS_EVERY', `total=${lastTotal} (need > 25 — use large-file.fig)`);
		log(ticks > 0, 'progress ticks reached on() rather than settling the request', `${ticks} ticks`);
		log(streamed > 0, 'partials streamed while the scan ran', `${streamed} rows streamed`);
		log(
			result.verdicts.length >= streamed,
			'the final result is a superset of what was streamed',
			`${result.verdicts.length} final vs ${streamed} streamed`,
		);
	} catch (err) {
		log(false, 'overflow scan on a large file', String(err));
	} finally {
		offProgress();
		offPartial();
	}

	console.log(`[bridge] complete — ${checks} checks logged`);
}
