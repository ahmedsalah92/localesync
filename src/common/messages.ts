// src/common/messages.ts
import type {
	ScannedTextNode,
	ExtractedString,
	OverflowVerdict,
	BlockedNode,
	PseudoLocOptions,
	PreviewMap,
} from './models';

export type ScanScope = 'page' | 'selection';

export type ErrorCode =
	| 'no-selection' // selection-scoped op with an empty selection
	| 'no-text-nodes' // scope contained no eligible text nodes
	| 'nodes-blocked' // op succeeded but some nodes were skipped; see `blocked` (warning severity)
	| 'mutation-failed' // batch rolled back; nothing left mutated (LS-4 withSnapshot failure)
	| 'node-gone' // select-node target deleted or not reachable on the current page
	| 'internal'; // unexpected

// Every message is an envelope: a `type` discriminant + a correlation `id`. Payload fields sit
// alongside (flat union — narrows cleanly on `type`).
interface Envelope<T extends string> {
	type: T;
	id: string;
}

// ── UI → main ────────────────────────────────────────────────────────────────
export interface ScanRequest extends Envelope<'scan-request'> {
	scope: ScanScope;
}
export interface ExtractionRequest extends Envelope<'extraction-request'> {
	scope: ScanScope;
}
export interface OverflowScanRequest extends Envelope<'overflow-scan-request'> {
	scope: ScanScope;
	targetLanguages: string[]; // §3 carve-out: ALWAYS plural. Phase 1 passes a 1-element array.
}
export interface ApplyPseudoLoc extends Envelope<'apply-pseudoloc'> {
	scope: ScanScope;
	options: PseudoLocOptions;
}
export type RevertPseudoLoc = Envelope<'revert-pseudoloc'>; // reverts all pseudo-loc'd nodes
export interface ApplyRtlMirror extends Envelope<'apply-rtl-mirror'> {
	scope: ScanScope;
}
export type RevertRtlMirror = Envelope<'revert-rtl-mirror'>;
export interface ApplyPreview extends Envelope<'apply-preview'> {
	translations: PreviewMap;
}
export type RevertPreview = Envelope<'revert-preview'>;
// Command, not request (no RequestResponse entry): failure is reported on `error` (`node-gone`),
// correlated by id. Shared surface — LS-8's results panel and LS-9's extraction list both send it.
export interface SelectNode extends Envelope<'select-node'> {
	nodeId: string;
}
// Command, not a request: no RequestResponse entry, matching `select-node`. Carries the correlation
// id of the scan it cancels; the outcome is that scan's eventual `overflow-scan-result` with
// `stopped: true` (LS-8.2 §1.2).
export type OverflowScanCancel = Envelope<'overflow-scan-cancel'>;

export type UiToMain =
	| ScanRequest
	| ExtractionRequest
	| OverflowScanRequest
	| ApplyPseudoLoc
	| RevertPseudoLoc
	| ApplyRtlMirror
	| RevertRtlMirror
	| ApplyPreview
	| RevertPreview
	| SelectNode
	| OverflowScanCancel;

// ── main → UI ────────────────────────────────────────────────────────────────
export interface ScanResult extends Envelope<'scan-result'> {
	nodes: ScannedTextNode[];
}
export interface ExtractionResult extends Envelope<'extraction-result'> {
	entries: ExtractedString[];
}
// Streamed mid-scan on the 25-node progress tick, under the scan request's own correlation id.
export interface OverflowScanPartial extends Envelope<'overflow-scan-partial'> {
	verdicts: OverflowVerdict[]; // THIS CHUNK ONLY — the UI accumulates.
}
export interface OverflowScanResult extends Envelope<'overflow-scan-result'> {
	verdicts: OverflowVerdict[]; // the complete set, including everything already streamed
	// True when the scan ended via `overflow-scan-cancel`. On the result rather than inferred
	// UI-side because a cancel sent in the same tick a scan finishes naturally would otherwise
	// leave the panel asserting a stop that did not happen (LS-8.2 §1.2).
	stopped?: boolean;
}
export interface ProgressMessage extends Envelope<'progress'> {
	completed: number;
	total: number;
	note?: string;
}
export interface ErrorMessage extends Envelope<'error'> {
	code: ErrorCode;
	severity: 'error' | 'warning'; // `nodes-blocked` is 'warning'; hard failures are 'error'
	message: string; // human-readable; LS-14 owns final copy
	blocked?: BlockedNode[]; // present for `nodes-blocked` (flag 4: apply/revert skip channel)
}

export type MainToUi =
	| ScanResult
	| ExtractionResult
	| OverflowScanPartial
	| OverflowScanResult
	| ProgressMessage
	| ErrorMessage;

export type AnyMessage = UiToMain | MainToUi;

// Request → response mapping. Drives the typed `request()` helper. Commands are absent: their
// outcome is reported on `progress`/`error`, correlated by id.
export interface RequestResponse {
	'scan-request': ScanResult;
	'extraction-request': ExtractionResult;
	'overflow-scan-request': OverflowScanResult;
}

/**
 * Runtime twin of `RequestResponse`: the message type each request settles on, as a value.
 *
 * `src/ui/bridge.ts` settles a pending request on this type rather than on a bare correlation-id
 * match. Progress ticks and streamed `overflow-scan-partial` chunks deliberately share their
 * request's id (LS-2 correlation design), so an id-only match resolved the promise with the wrong
 * message — see LS-8.2 §1.4. The mapped type makes a wrong entry here a compile error.
 */
export const RESPONSE_TYPE: { [T in keyof RequestResponse]: RequestResponse[T]['type'] } = {
	'scan-request': 'scan-result',
	'extraction-request': 'extraction-result',
	'overflow-scan-request': 'overflow-scan-result',
};

const UI_TO_MAIN_TYPES = [
	'scan-request',
	'extraction-request',
	'overflow-scan-request',
	'apply-pseudoloc',
	'revert-pseudoloc',
	'apply-rtl-mirror',
	'revert-rtl-mirror',
	'apply-preview',
	'revert-preview',
	'select-node',
	'overflow-scan-cancel',
] as const;

const MAIN_TO_UI_TYPES = [
	'scan-result',
	'extraction-result',
	'overflow-scan-partial',
	'overflow-scan-result',
	'progress',
	'error',
] as const;

const ALL_TYPES: ReadonlySet<string> = new Set<string>([...UI_TO_MAIN_TYPES, ...MAIN_TO_UI_TYPES]);

/**
 * Runtime shape guard. Both bridge dispatchers validate every inbound message with this and drop
 * anything that fails (Plugma dev-harness traffic, stray window events). Pure — Vitest-tested.
 */
export function isPluginMessage(x: unknown): x is AnyMessage {
	if (typeof x !== 'object' || x === null) return false;
	const m = x as Record<string, unknown>;
	return typeof m.type === 'string' && ALL_TYPES.has(m.type) && typeof m.id === 'string';
}
