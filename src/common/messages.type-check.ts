// src/common/messages.type-check.ts
//
// Compile-time negative tests for the message envelope/union. Checked by `npx tsc -b`; never run.
// Each `@ts-expect-error` asserts the following line IS a type error — if the contract loosens and
// the error disappears, tsc fails the build. Only cases expressible from `common` types live here;
// the request()-dependent cases live in src/ui/bridge.type-check.ts (common cannot import ui).
//
// Sample values are exported solely to satisfy no-unused-vars.
import type { OverflowScanRequest, ScanRequest, UiToMain } from './messages';

// Misspelled discriminant — 'scan-requst' is not a member of the UiToMain union.
// @ts-expect-error a value with an unknown `type` is not assignable to UiToMain.
export const badType: UiToMain = { type: 'scan-requst', id: 'x', scope: 'page' };

// Missing required field — scan-request must carry `scope`.
// @ts-expect-error ScanRequest requires the `scope` field.
export const missingScope: ScanRequest = { type: 'scan-request', id: 'x' };

// Wrong field type — targetLanguages is `string[]` (agent-guidelines §3), never a scalar.
export const scalarLangs: OverflowScanRequest = {
	type: 'overflow-scan-request',
	id: 'x',
	scope: 'page',
	// @ts-expect-error targetLanguages must be a string[], not a scalar string.
	targetLanguages: 'en',
};
