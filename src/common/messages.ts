// src/common/messages.ts
import type {
	ScannedTextNode,
	ExtractedString,
	OverflowVerdict,
	BlockedNode,
	FlaggedNode,
	PseudoLocOptions,
	PreviewMap,
	PreviewRow,
} from './models';
import type { ProPillar } from './pro';

export type ScanScope = 'page' | 'selection';

export type ErrorCode =
	| 'no-selection' // selection-scoped op with an empty selection
	| 'no-text-nodes' // scope contained no eligible text nodes
	| 'nodes-blocked' // op succeeded but some nodes were skipped; see `blocked` (warning severity)
	| 'mutation-failed' // batch rolled back; nothing left mutated (LS-4 withSnapshot failure)
	| 'node-gone' // select-node target deleted or not reachable on the current page
	| 'no-keys' // page has text layers but none owns an LS-9 key: nothing extracted yet (LS-12)
	| 'storage-failed' // clientStorage refused the write: 5 MB cap, cleared or unavailable (LS-12)
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
// The main thread holds the imported translations (LS-12 §1.2), so apply names a language.
export interface ApplyPreview extends Envelope<'apply-preview'> {
	language: string; // canonical BCP 47, one of the stored languages
}
export type RevertPreview = Envelope<'revert-preview'>;
// Commands: outcome on progress/error. Each map REPLACES that stored language wholesale.
export interface PreviewImport extends Envelope<'preview-import'> {
	maps: PreviewMap[];
}
// null or '' deletes the translation, so the layer falls back to source.
export interface PreviewEdit extends Envelope<'preview-edit'> {
	language: string;
	key: string;
	value: string | null;
}
export type PreviewStateRequest = Envelope<'preview-state-request'>;
// Command, not request (no RequestResponse entry): failure is reported on `error` (`node-gone`),
// correlated by id. Shared surface — LS-8's results panel and LS-9's extraction list both send it.
export interface SelectNode extends Envelope<'select-node'> {
	nodeId: string;
}
// Command, not a request: no RequestResponse entry, matching `select-node`. Carries the correlation
// id of the scan it cancels; the outcome is that scan's eventual `overflow-scan-result` with
// `stopped: true` (LS-8.2 §1.2).
export type OverflowScanCancel = Envelope<'overflow-scan-cancel'>;
// Fire-and-forget command. Every move in one drag reuses that gesture's correlation id.
export interface ResizeWindow extends Envelope<'resize-window'> {
	width: number;
	height: number;
}
// LS-13 §1.2. Command: main opens the waitlist in the browser, then answers `progress` (or
// `internal` if openExternal throws). The plugin itself sends nothing anywhere.
export interface OpenWaitlist extends Envelope<'open-waitlist'> {
	pillar: ProPillar;
}
// LS-13 §1.2. Command: main persists the first-run flag in clientStorage; best-effort, answers `progress`.
export interface TelemetryMark extends Envelope<'telemetry-mark'> {
	flag: 'first-scan';
}
// LS-13 §1.2. Request, once per launch; answered by `telemetry-state`.
export type TelemetryStateRequest = Envelope<'telemetry-state-request'>;

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
	| PreviewImport
	| PreviewEdit
	| PreviewStateRequest
	| SelectNode
	| OverflowScanCancel
	| ResizeWindow
	| OpenWaitlist
	| TelemetryMark
	| TelemetryStateRequest;

// ── main → UI ────────────────────────────────────────────────────────────────
export interface ScanResult extends Envelope<'scan-result'> {
	nodes: ScannedTextNode[];
}
export interface ExtractionResult extends Envelope<'extraction-result'> {
	entries: ExtractedString[];
	// Rejected stamps, reason 'instance-locked' (LS-9 §2.17). On the result rather than a trailing
	// `nodes-blocked` error: sent after the result, that error had no pending request to match.
	blocked: BlockedNode[];
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

/**
 * The RTL mirror's review list (LS-11 §2.9). Sent BEFORE the terminal `progress`, so a panel that
 * treats progress as "finished" already holds the list when it renders — the same ordering
 * discipline `nodes-blocked` follows.
 *
 * A separate message rather than a `RequestResponse` entry: apply stays a command, so its failure
 * path is unchanged, and an empty review list is simply no message. (LS-11 §1 originally claimed no
 * transport change was needed; that was wrong — `nodes-blocked` carries nodes that were SKIPPED, and
 * these were mirrored successfully.)
 */
export interface RtlFlagged extends Envelope<'rtl-flagged'> {
	flagged: FlaggedNode[];
}

/** The stored languages for this file (LS-12 §2.2). */
export interface PreviewState extends Envelope<'preview-state'> {
	languages: string[]; // sorted by code
}
/**
 * The rows and unmatched keys of an apply or edit (LS-12 §1.2). Sent BEFORE the terminal progress
 * and before any `nodes-blocked` warning, the `rtl-flagged` ordering, so a panel treating progress
 * as "finished" already holds them.
 */
export interface PreviewResult extends Envelope<'preview-result'> {
	language: string;
	rows: PreviewRow[]; // every non-blocked key-owning text layer on the page, in document order
	unmatched: string[]; // stored keys of this language that no layer owns, sorted
}
/** First-run flags for the install / first_scan events (LS-13 §1.2). */
export interface TelemetryState extends Envelope<'telemetry-state'> {
	firstLaunch: boolean; // true exactly once: this answer is what marked the plugin installed
	firstScanDone: boolean;
}

export type MainToUi =
	| ScanResult
	| ExtractionResult
	| OverflowScanPartial
	| OverflowScanResult
	| ProgressMessage
	| ErrorMessage
	| RtlFlagged
	| PreviewState
	| PreviewResult
	| TelemetryState;

export type AnyMessage = UiToMain | MainToUi;

// Request → response mapping. Drives the typed `request()` helper. Commands are absent: their
// outcome is reported on `progress`/`error`, correlated by id.
export interface RequestResponse {
	'scan-request': ScanResult;
	'extraction-request': ExtractionResult;
	'overflow-scan-request': OverflowScanResult;
	'preview-state-request': PreviewState;
	'telemetry-state-request': TelemetryState;
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
	'preview-state-request': 'preview-state',
	'telemetry-state-request': 'telemetry-state',
};

/**
 * The runtime allow-list `isPluginMessage` checks, one entry per member of each union.
 *
 * A `Record` over the union's `type`, not an array, so it is exhaustive by construction: a message
 * type missing here is a compile error, and so is an entry the union does not have. As a plain
 * array it drifted — `rtl-flagged` was added to `MainToUi` by LS-11 but never here, so the UI bridge
 * dropped every one and the RTL review list never reached the panel (found in LS-28).
 */
const UI_TO_MAIN_TYPES: Record<UiToMain['type'], true> = {
	'scan-request': true,
	'extraction-request': true,
	'overflow-scan-request': true,
	'apply-pseudoloc': true,
	'revert-pseudoloc': true,
	'apply-rtl-mirror': true,
	'revert-rtl-mirror': true,
	'apply-preview': true,
	'revert-preview': true,
	'preview-import': true,
	'preview-edit': true,
	'preview-state-request': true,
	'select-node': true,
	'overflow-scan-cancel': true,
	'resize-window': true,
	'open-waitlist': true,
	'telemetry-mark': true,
	'telemetry-state-request': true,
};

const MAIN_TO_UI_TYPES: Record<MainToUi['type'], true> = {
	'scan-result': true,
	'extraction-result': true,
	'overflow-scan-partial': true,
	'overflow-scan-result': true,
	progress: true,
	error: true,
	'rtl-flagged': true,
	'preview-state': true,
	'preview-result': true,
	'telemetry-state': true,
};

/**
 * The same allow-lists as typed arrays, for code that must visit every type — the dev round-trip
 * driver (LS-31), whose hand-kept copies drifted exactly as the allow-list once did. Functions, not
 * module-level constants, so production — where only dev code calls them — tree-shakes them away.
 * The cast is sound because the Records are exhaustive over, and limited to, each union's types.
 */
export function uiToMainTypes(): UiToMain['type'][] {
	return Object.keys(UI_TO_MAIN_TYPES) as UiToMain['type'][];
}

export function mainToUiTypes(): MainToUi['type'][] {
	return Object.keys(MAIN_TO_UI_TYPES) as MainToUi['type'][];
}

const ALL_TYPES: ReadonlySet<string> = new Set<string>([
	...Object.keys(UI_TO_MAIN_TYPES),
	...Object.keys(MAIN_TO_UI_TYPES),
]);

/**
 * Runtime shape guard. Both bridge dispatchers validate every inbound message with this and drop
 * anything that fails (Plugma dev-harness traffic, stray window events). Pure — Vitest-tested.
 */
export function isPluginMessage(x: unknown): x is AnyMessage {
	if (typeof x !== 'object' || x === null) return false;
	const m = x as Record<string, unknown>;
	return typeof m.type === 'string' && ALL_TYPES.has(m.type) && typeof m.id === 'string';
}
