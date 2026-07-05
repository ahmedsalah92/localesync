// src/ui/roundtrip.ts  (iframe; dev-only driver for the __test:roundtrip command)
//
// LS-2 transport-conformance harness, UI side. Drives every fixture across the real bridge and logs
// PASS/FAIL to the console:
//   • main→UI — deep-equals each MainToUi fixture (echoed verbatim by main) against the canonical.
//   • UI→main — sends each of the six commands; main reports pass/fail on the progress/error channel.
//   • request/response — awaits the three request pairs; main also sends a decoy result with a
//     non-matching id (must be ignored) before the real answer.
//   • guard-and-drop — dispatches malformed inbound window events; the bridge must drop them.
//
// Scaffolding only — never run by Vitest (needs a real Figma runtime). Invoke via the dev-only
// button in App.tsx under `npm run dev`.
import type { MainToUi, UiToMain } from '../common/messages';
import { fixtures } from '../common/messages.fixtures';
import { on, request, send } from './bridge';

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((v, i) => deepEqual(v, b[i]));
	}
	const ao = a as Record<string, unknown>;
	const bo = b as Record<string, unknown>;
	const ak = Object.keys(ao);
	if (ak.length !== Object.keys(bo).length) return false;
	return ak.every((k) => deepEqual(ao[k], bo[k]));
}

const MAIN_TO_UI_TYPES: MainToUi['type'][] = [
	'scan-result',
	'extraction-result',
	'overflow-scan-result',
	'progress',
	'error',
];

const COMMAND_TYPES: UiToMain['type'][] = [
	'apply-pseudoloc',
	'revert-pseudoloc',
	'apply-rtl-mirror',
	'revert-rtl-mirror',
	'apply-preview',
	'revert-preview',
];

export async function runRoundtrip(): Promise<void> {
	let checks = 0;
	const log = (ok: boolean, label: string) => {
		checks++;
		console.log(`[roundtrip] ${ok ? 'PASS' : 'FAIL'}  ${label}`);
	};

	// main→UI conformance: each verbatim fixture (matched by its own fixture id) must deep-equal.
	for (const type of MAIN_TO_UI_TYPES) {
		const fixture = fixtures.find((m) => m.type === type);
		on(type, (msg) => {
			if (fixture && msg.id === fixture.id) log(deepEqual(msg, fixture), `main→ui ${type}`);
			// A non-matching overflow id here is the intentional decoy — correctly ignored (no log).
		});
	}

	// UI→main conformance: main reports each command back on progress (pass) / error (fail).
	const pendingCmd = new Map<string, string>();
	on('progress', (msg) => {
		const type = pendingCmd.get(msg.id);
		if (type) {
			pendingCmd.delete(msg.id);
			log(true, `ui→main ${type}`);
		}
	});
	on('error', (msg) => {
		const type = pendingCmd.get(msg.id);
		if (type) {
			pendingCmd.delete(msg.id);
			log(false, `ui→main ${type} (main reported mismatch)`);
		}
	});

	for (const type of COMMAND_TYPES) {
		const fixture = fixtures.find((m) => m.type === type);
		if (!fixture) continue;
		const body = { ...fixture } as Record<string, unknown>;
		delete body.id;
		const mintedId = send(body as Omit<UiToMain, 'id'>);
		pendingCmd.set(mintedId, type);
	}

	// request/response correlation for the three pairs.
	try {
		const scan = await request('scan-request', { scope: 'page' });
		log(scan.type === 'scan-result', 'request scan-request → scan-result (matching id)');
	} catch {
		log(false, 'request scan-request (unexpected reject)');
	}
	try {
		const extraction = await request('extraction-request', { scope: 'selection' });
		log(extraction.type === 'extraction-result', 'request extraction-request → extraction-result');
	} catch {
		log(false, 'request extraction-request (unexpected reject)');
	}
	try {
		const overflow = await request('overflow-scan-request', { scope: 'page', targetLanguages: ['de'] });
		log(overflow.type === 'overflow-scan-result', 'request overflow-scan-request → overflow-scan-result');
	} catch {
		log(false, 'request overflow-scan-request (unexpected reject)');
	}

	// guard-and-drop (UI dispatcher): synthesize malformed inbound events straight at the window
	// listener (dispatchEvent, not postMessage — no transport involved). The bridge must drop both
	// silently; if either reached a handler the PASS/FAIL log above would show spurious lines.
	window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: { foo: 1 } } }));
	window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: { type: 'plugma-dev-event' } } }));
	log(true, 'guard-and-drop: malformed inbound dispatched (expect no extra FAIL lines)');

	console.log(`[roundtrip] complete — ${checks} checks logged`);
}
