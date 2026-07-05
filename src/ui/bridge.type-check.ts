// src/ui/bridge.type-check.ts
//
// Compile-time tests for the ui-side `request()` helper. Checked by `npx tsc -b`; never run. These
// live in the ui project (not src/common/messages.type-check.ts) because `request` is ui-owned and
// `common` cannot import `ui` (ambient split + circular project reference). Exported wrapper only
// to satisfy no-unused-vars; the body is never executed.
import { request } from './bridge';
import type { ExtractionResult, OverflowScanResult, ScanResult } from '../common/messages';

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
}
