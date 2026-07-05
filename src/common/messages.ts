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

export type UiToMain =
	| ScanRequest
	| ExtractionRequest
	| OverflowScanRequest
	| ApplyPseudoLoc
	| RevertPseudoLoc
	| ApplyRtlMirror
	| RevertRtlMirror
	| ApplyPreview
	| RevertPreview;

// ── main → UI ────────────────────────────────────────────────────────────────
export interface ScanResult extends Envelope<'scan-result'> {
	nodes: ScannedTextNode[];
}
export interface ExtractionResult extends Envelope<'extraction-result'> {
	entries: ExtractedString[];
}
export interface OverflowScanResult extends Envelope<'overflow-scan-result'> {
	verdicts: OverflowVerdict[];
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

export type MainToUi = ScanResult | ExtractionResult | OverflowScanResult | ProgressMessage | ErrorMessage;

export type AnyMessage = UiToMain | MainToUi;

// Request → response mapping. Drives the typed `request()` helper. Commands are absent: their
// outcome is reported on `progress`/`error`, correlated by id.
export interface RequestResponse {
	'scan-request': ScanResult;
	'extraction-request': ExtractionResult;
	'overflow-scan-request': OverflowScanResult;
}

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
] as const;

const MAIN_TO_UI_TYPES = ['scan-result', 'extraction-result', 'overflow-scan-result', 'progress', 'error'] as const;

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
