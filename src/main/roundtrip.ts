// src/main/roundtrip.ts  (main thread; dev-only scaffold for the __test:roundtrip command)
//
// LS-2 transport-conformance harness, main side. Registers a handler for every UiToMain type it
// still owns — scan-request is superseded by the real LS-3 traversal handler (registered first in
// main.ts), which answers the roundtrip's scan probe with a genuine scan-result. Each handler
// deep-equals the inbound message against its canonical fixture (payload only — the id is minted
// UI-side) and reports the outcome on the typed channel: the two remaining request types answer
// with their *-result fixture (correlated by id); the six commands answer with a `progress` (pass)
// or `error` (fail). Receipt of the last command additionally emits the five MainToUi fixtures
// verbatim so the UI can assert the main→UI direction for every result/notification type.
//
// This is scaffolding only — real feature handlers (LS-3+) replace these registrations. It is never
// exercised by Vitest (no `figma` runtime); run it via `npm run dev` and the UI's dev-only button.
import type {
	ErrorMessage,
	ExtractionResult,
	OverflowScanResult,
	ProgressMessage,
	ScanResult,
} from '../common/messages';
import { fixtures } from '../common/messages.fixtures';
import { on, respond, send } from './bridge';

// Deep structural equality for structured-clone-serializable data (objects, arrays, primitives).
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

// Compare an inbound message against its fixture, ignoring the (UI-minted) id.
function matches(type: string, msg: { id: string }): boolean {
	const fixture = fixtures.find((m) => m.type === type);
	if (!fixture) return false;
	return deepEqual({ ...fixture, id: msg.id }, msg);
}

const scanResult = fixtures.find((m) => m.type === 'scan-result') as ScanResult;
const extractionResult = fixtures.find((m) => m.type === 'extraction-result') as ExtractionResult;
const overflowResult = fixtures.find((m) => m.type === 'overflow-scan-result') as OverflowScanResult;
const progressFx = fixtures.find((m) => m.type === 'progress') as ProgressMessage;
const errorFx = fixtures.find((m) => m.type === 'error') as ErrorMessage;

function fail(id: string, message: string): ErrorMessage {
	return { type: 'error', id, code: 'internal', severity: 'error', message };
}

// Emit every MainToUi fixture verbatim (with its own fixture id) so the UI can deep-equal the
// main→UI transport for all five result/notification types.
function emitVerbatim(): void {
	send(scanResult);
	send(extractionResult);
	send(overflowResult);
	send(progressFx);
	send(errorFx);
}

export function registerRoundtrip(): void {
	const report = (id: string, ok: boolean, label: string) => {
		if (ok) send({ type: 'progress', id, completed: 1, total: 1, note: `ok:${label}` });
		else send(fail(id, `mismatch:${label}`));
	};

	// Requests: answer with the matching *-result fixture (respond() attaches the request id).
	// scan-request is deliberately absent — the LS-3 handler owns it; a second registration here
	// would double-answer every real scan.
	on('extraction-request', (msg) => {
		if (matches('extraction-request', msg)) respond<'extraction-request'>(msg.id, extractionResult);
		else send(fail(msg.id, 'mismatch:extraction-request'));
	});
	on('overflow-scan-request', (msg) => {
		if (!matches('overflow-scan-request', msg)) {
			send(fail(msg.id, 'mismatch:overflow-scan-request'));
			return;
		}
		// A decoy with a NON-matching id first — the UI's pending map must ignore it — then the real
		// answer, whose id matches and resolves the promise.
		send({ ...overflowResult, id: 'decoy-ignored-id' });
		respond<'overflow-scan-request'>(msg.id, overflowResult);
	});

	// Commands: fire-and-forget; report pass/fail on the progress/error channel, correlated by id.
	on('apply-pseudoloc', (msg) => report(msg.id, matches('apply-pseudoloc', msg), 'apply-pseudoloc'));
	on('revert-pseudoloc', (msg) => report(msg.id, matches('revert-pseudoloc', msg), 'revert-pseudoloc'));
	on('apply-rtl-mirror', (msg) => report(msg.id, matches('apply-rtl-mirror', msg), 'apply-rtl-mirror'));
	on('revert-rtl-mirror', (msg) => report(msg.id, matches('revert-rtl-mirror', msg), 'revert-rtl-mirror'));
	on('apply-preview', (msg) => report(msg.id, matches('apply-preview', msg), 'apply-preview'));
	on('revert-preview', (msg) => {
		report(msg.id, matches('revert-preview', msg), 'revert-preview');
		// Last command received → echo the MainToUi fixtures for the main→UI conformance check.
		emitVerbatim();
	});
}
