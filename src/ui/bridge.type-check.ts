// src/ui/bridge.type-check.ts
//
// Compile-time tests for the ui-side `request()` helper. Checked by `npx tsc -b`; never run. These
// live in the ui project (not src/common/messages.type-check.ts) because `request` is ui-owned and
// `common` cannot import `ui` (ambient split + circular project reference). Exported wrapper only
// to satisfy no-unused-vars; the body is never executed.
import { request, requestWithId } from './bridge';
import { RESPONSE_TYPE } from '../common/messages';
import type { ExtractionResult, OverflowScanPartial, OverflowScanResult, ScanResult } from '../common/messages';

export async function _requestTypeChecks(): Promise<void> {
	// Positive — each request pair resolves its mapped RequestResponse type.
	const scan: Promise<ScanResult> = request('scan-request', { scope: 'page' });
	const extraction: Promise<ExtractionResult> = request('extraction-request', { scope: 'selection' });
	const overflow: Promise<OverflowScanResult> = request('overflow-scan-request', {
		scope: 'page',
		targetLanguages: ['de'],
	});
	void scan;
	void extraction;
	void overflow;

	// Negative — scan-request resolves ScanResult; assigning it to ExtractionResult must error.
	// @ts-expect-error awaited scan-request is a ScanResult, not an ExtractionResult.
	const wrong: ExtractionResult = await request('scan-request', { scope: 'page' });
	void wrong;

	// ── The settlement contract (LS-8.2 §1.4) ────────────────────────────────
	// A pending request records the type it settles on, taken from RESPONSE_TYPE. These assert that
	// mapping as a value, so a wrong entry is a compile error here rather than a runtime
	// mis-settlement — the defect that made `progress` resolve an in-flight scan is unreachable by
	// Vitest (bridge.ts touches `window` at module scope; agent-guidelines §6 rules out jsdom), so
	// this and the >25-node in-Figma run are its only cover.
	const settlesOn: 'overflow-scan-result' = RESPONSE_TYPE['overflow-scan-request'];
	void settlesOn;

	// @ts-expect-error a scan settles on its result, never on a streamed partial.
	const wrongExpect: 'overflow-scan-partial' = RESPONSE_TYPE['overflow-scan-request'];
	void wrongExpect;

	// requestWithId exposes the correlation id alongside the same typed promise request() returns.
	const inFlight: { id: string; response: Promise<OverflowScanResult> } = requestWithId('overflow-scan-request', {
		scope: 'page',
		targetLanguages: ['de'],
	});
	void inFlight;

	// @ts-expect-error the streamed partial is not what the request settles with.
	const wrongResponse: Promise<OverflowScanPartial> = requestWithId('overflow-scan-request', {
		scope: 'page',
		targetLanguages: ['de'],
	}).response;
	void wrongResponse;
}
