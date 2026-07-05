# LS-2 — Typed postMessage bridge + full Phase-1 message contract

**Epic:** Foundation · **Complexity:** Med · **Blocked by:** LS-1 · **Agent-readiness:** ready

Defines the *entire* Phase-1 message surface once, as a shared discriminated union, plus the thin typed `send`/`on`/`request` wrappers on each side. Every later feature adds *handlers*, never new message types or new transport. The bridge is where a wrong-shaped message becomes a compile error instead of a runtime surprise.

This spec references upstream types by owner and never redefines them (agent-guidelines §4). Where an owner's type must cross the bridge but its spec isn't written yet, LS-2 stands up a **canonical stub** in `src/common/models.ts`, annotated with its owner; that spec later expands the stub *in place*. One definition per type, ever.

---

## Design (the agent must follow this model, not invent one)

Two constraints fix the shape of this issue; both are load-bearing.

1. **`src/common` is ambient-free (agent-guidelines §1).** It's imported by both threads, so it must not reference `figma` (main-only) or `window`/DOM (ui-only). Therefore the **message *types* live in `common`, but the *transport code* cannot** — it splits per side.
2. **Only structured-clone-serializable data crosses `postMessage`.** Live nodes and the `figma.mixed` symbol are not serializable (Figma docs, API pin below). Therefore every payload is a plain-data **wire DTO**, never a live model.

From those, the file layout is forced:

| File | Project | Holds | Ambient |
|---|---|---|---|
| `src/common/messages.ts` | common | Envelope, the two unions, `RequestResponse` map, `isPluginMessage` guard | none |
| `src/common/models.ts` | common | The cross-bridge wire DTOs, each owned upstream (stubs expanded in place) | none |
| `src/main/bridge.ts` | main | `send` / `on` / `respond` over `figma.ui.postMessage` / `figma.ui.onmessage` | `figma` |
| `src/ui/bridge.ts` | ui | `send` / `on` / `request` over `parent.postMessage` / `window` message events | DOM |

> **Folder-map note (for CLAUDE.md / agent-guidelines §1):** the §1 map lists only `src/common/messages.ts` for LS-2. This spec additionally creates `src/common/models.ts`, `src/main/bridge.ts`, and `src/ui/bridge.ts` — required by the ambient split above. Record LS-2 as their owner.

**Transport rules the wrappers enforce:**

- **Single inbound slot, multiplexed.** Each side owns exactly one raw listener (`figma.ui.onmessage` on main; one `window` `'message'` listener on the UI) and dispatches to many typed handlers registered via `on(type, handler)`. Feature code never touches the raw listener.
- **Guard-and-drop on every inbound message.** Both dispatchers validate with `isPluginMessage` and **silently ignore** anything that fails — this filters Plugma dev-harness traffic sharing the channel, and any stray `window` message events in the UI.
- **Correlation by `id`.** Every message carries a string `id`. Requests mint a fresh id; responses echo it; `progress`/`error` carry the id of the operation they report on. This is what lets the UI match async answers and out-of-order notifications to their trigger.
- **Requests vs commands.** Three message pairs are request→response (`scan`, `extraction`, `overflow-scan`) and resolve a promise via `request()`. The six apply/revert messages are **fire-and-forget commands**: their outcome surfaces on the generic `progress` (done) and `error` (failure or partial-skip) channels, correlated by id. A handler for a request **must always answer** — a result *or* an `error` with the same id — or the UI's pending promise leaks.

---

## Contracts

### `src/common/models.ts` — cross-bridge wire DTOs (owned upstream)

```ts
// src/common/models.ts
//
// Plain-data shapes that cross the postMessage bridge. Each is OWNED by the feature spec named
// in its banner and lives here ONLY because it must (a) be structured-clone-serializable and
// (b) be importable by BOTH threads — and src/common is the one place both sides can import.
// When the owning spec is written, it EXPANDS its type in place here. Never fork a second copy
// (agent-guidelines §4): a missing field is fixed upstream, here, not by redefining downstream.

// ── owned by LS-3 (traversal) — expand here, do not fork ──
// Serializable projection of LS-3's TextNodeModel: only the fields the UI results list and
// jump-to-node need. The live model (fonts as FontName | typeof figma.mixed, container refs)
// stays main-side; LS-3 maps it to this DTO when it answers a scan.
export interface ScannedTextNode {
	nodeId: string;
	characters: string;
	containerLabel: string; // display path, e.g. "home / header"
	hasMissingFont: boolean;
	isMixedFont: boolean;
	inInstance: boolean;
	locked: boolean;
	hidden: boolean;
	empty: boolean;
}

// ── owned by LS-9 (extraction) — expand here, do not fork ──
// Shape matches the `ExtractedString` the LS-6 export spec imports; this is the one definition
// both LS-6 (ui) and LS-9 (main) share. If LS-9's panel needs `duplicateOf`, add it HERE.
export interface ExtractedString {
	key: string;
	nodeId: string;
	value: string;
}

// ── owned by LS-8 (overflow, post-LS-7) — expand here, do not fork ──
// The `verdict` vocabulary is PROVISIONAL: it encodes the brief §4 per-mode definitions, but the
// measurement spike (LS-7) and LS-8 tighten it. Widen/narrow this union HERE when LS-8 lands.
export interface OverflowVerdict {
	nodeId: string;
	language: string;
	verdict: 'fits' | 'clips' | 'overflows' | 'truncates' | 'unmeasurable';
	severity?: 'warn' | 'error';
}

// ── owned by LS-4 (snapshot) — expand here, do not fork ──
// Reason a node was NOT mutated. The LS-4 example declares this in src/main/snapshot; it is
// RELOCATED here because the `error` message carries it across the bridge (see upstream note).
// LS-4 imports BlockReason from common rather than declaring it.
export type BlockReason =
	| 'missing-font'
	| 'mixed-font-char-mutation'
	| 'instance-locked'
	| 'empty';

export interface BlockedNode {
	nodeId: string;
	reason: BlockReason;
}

// ── owned by LS-10 (pseudo-loc) — expand here, do not fork ──
export interface PseudoLocOptions {
	expansionPct: number; // e.g. 30–50
	accent: boolean;
	brackets: boolean;
}

// ── owned by LS-12 (preview) — expand here, do not fork ──
// Translations parsed UI-side from JSON/CSV, keyed to LS-9 keys. Main resolves key→node and
// reports keys that match nothing (LS-12 success criterion).
export interface PreviewMap {
	language: string;
	entries: { key: string; value: string }[];
}
```

> **No `RtlMirrorOptions`.** RTL mirroring uses a fixed, human-authored ruleset (RTL-1 / LS-20), not user-supplied config, so `apply-rtl-mirror` carries only `scope`. If LS-11 later adds user options, add an owner-stubbed `RtlMirrorOptions` here and reference it from the command — the envelope stays frozen either way.

### `src/common/messages.ts` — envelope, unions, guard (LS-2-owned)

```ts
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
```

### `src/main/bridge.ts` — main-side transport

```ts
// src/main/bridge.ts  (main thread; uses the `figma` global)
import { isPluginMessage, type UiToMain, type MainToUi, type RequestResponse } from '../common/messages';

/** Send a message to the UI. `id` must already be set (echoed from a request, or minted for an
 *  unsolicited notification via `nextMainId()`). */
export function send(msg: MainToUi): void;

/** Answer a request: attaches the request's id to `result` and sends it. Use for the three
 *  request/response pairs. */
export function respond<T extends keyof RequestResponse>(
	requestId: string,
	result: Omit<RequestResponse[T], 'id'>,
): void;

/** Register a typed handler for one inbound message type. Returns an unsubscribe fn. The bridge
 *  owns `figma.ui.onmessage`; handlers never touch it directly. Inbound messages are validated
 *  with isPluginMessage and non-conforming ones are dropped. */
export function on<T extends UiToMain['type']>(type: T, handler: (msg: Extract<UiToMain, { type: T }>) => void): () => void;

/** Mint an id for a main-originated unsolicited message (e.g. an error during restore-on-launch,
 *  which no UI request triggered). Counter-based: `main-<n>`. */
export function nextMainId(): string;
```

### `src/ui/bridge.ts` — UI-side transport

```ts
// src/ui/bridge.ts  (iframe; uses window/parent)
import { type UiToMain, type MainToUi, type RequestResponse } from '../common/messages';

/** Send a UI→main message. The bridge mints and attaches the `id`, posts it wrapped as
 *  { pluginMessage }, and returns the id so callers can correlate later progress/error. Use for
 *  the fire-and-forget apply/revert commands. */
export function send<M extends UiToMain>(msg: Omit<M, 'id'>): string;

/** Send a request and resolve with its typed response, matched by id. Rejects if main answers
 *  with an `error` carrying the same id. No timeout — a request handler is contractually obliged
 *  to answer (result or error), which also covers long scans (LS-15). */
export function request<T extends keyof RequestResponse>(
	type: T,
	fields: Omit<Extract<UiToMain, { type: T }>, 'type' | 'id'>,
): Promise<RequestResponse[T]>;

/** Register a typed handler for one inbound message type (e.g. 'progress', 'error',
 *  'extraction-result'). Returns an unsubscribe fn. One shared window 'message' listener
 *  unwraps event.data.pluginMessage, validates with isPluginMessage, and dispatches. */
export function on<T extends MainToUi['type']>(type: T, handler: (msg: Extract<MainToUi, { type: T }>) => void): () => void;
```

---

## Resolved defaults (use exactly these — do not choose)

- **Envelope:** flat discriminated union; `id: string` mandatory on **all 14** message types, including one-way commands (uniform transport).
- **Correlation id scheme:** counter-based, per side, no environment assumptions. UI mints `` `ui-${(seq++).toString(36)}` `` (module-scoped `seq`); main echoes it on responses and, for unsolicited notifications only, mints `` `main-${(seq++).toString(36)}` ``. **Do not depend on `crypto.randomUUID`** — it is not guaranteed on the main thread and is unnecessary here.
- **Message count:** 9 UI→main + 5 main→UI = 14. There is **no `export-request`/`export-result`** — export is UI-local (see Precision fixes / LS-6): the UI already holds `ExtractedString[]` from `extraction-result`, serialization is pure and DOM-free, and the download needs the DOM main lacks.
- **`extraction-request` exists** and pairs with `extraction-result` (added vs. the issue table — see Precision fixes).
- **`overflow-scan-request.targetLanguages` is `string[]`** (agent-guidelines §3); the first implementation passes a single-element array.
- **Apply/revert outcome (flag 4):** on success, main emits `progress` with `completed === total`. If any nodes were skipped, main additionally emits `error` with `code: 'nodes-blocked'`, `severity: 'warning'`, and `blocked: BlockedNode[]`. Hard failure (LS-4 batch rollback) → `error` with `code: 'mutation-failed'`, `severity: 'error'`. Both carry the command's `id`.
- **Multiplex ownership:** the bridge owns the single raw listener on each side; `on()` registers into a `Map<type, Set<handler>>`. Feature code never assigns `figma.ui.onmessage` or adds its own `window` message listener.
- **Guard-and-drop:** every inbound message passes through `isPluginMessage`; failures are ignored silently (no throw, no log spam).
- **Serializer discipline:** payloads contain only structured-clone-serializable data (objects, arrays, primitives, `null`, `undefined`, `Date`, `Uint8Array`). No `figma.mixed`, no live node references, no functions ever enter a message. If a payload needs data that isn't serializable, the producing feature maps it to a DTO first — never widen a message to carry a live value.

---

## Figma API pin

The transport primitives below are **not yet in agent-guidelines §2** — inlined here because they're load-bearing, and **recommended for promotion to §2** (see Precision fixes). For every other API surface, consult agent-guidelines §2, then `https://developers.figma.com/docs/plugins/`.

- **main → UI:** `figma.ui.postMessage(msg)`. Sends only structured-clone-serializable data. (`.../api/properties/figma-ui-postmessage/`)
- **main receives:** `figma.ui.onmessage = (message, props) => {}` — `message` is the value the UI put on `pluginMessage` (already unwrapped); `props.origin` is available. It's a single assignable slot — the bridge owns it and multiplexes. (`.../api/properties/figma-ui-onmessage/`)
- **UI → main:** `parent.postMessage({ pluginMessage: msg }, '*')`. The `{ pluginMessage }` wrapper and the `'*'` second argument are both required. (`.../creating-ui/`)
- **UI receives:** a `window` `'message'` listener; the payload is `event.data.pluginMessage`. (`.../creating-ui/`)
- **Serializable set:** objects, arrays, numbers, strings, booleans, `null`, `undefined`, `Date`, `Uint8Array`. The `figma.mixed` symbol and live nodes are **not** serializable — the reason payloads are DTOs.
- **Lint:** `@typescript-eslint/no-empty-object-type` is active (recommended config, default options). An empty-body interface extending the envelope (`interface Foo extends Envelope<'x'> {}`) **errors** — payload-free messages are declared as **type aliases** (`type RevertPreview = Envelope<'revert-preview'>`), as above.

---

## Acceptance

**Fixture:** `src/common/messages.fixtures.ts` — a `readonly AnyMessage[]` (agent must create) with **exactly one canonical value per message type** (all 14), each with a distinct `id`. This is the single source of truth for "one of every type," shared by the unit tests and the in-Figma round-trip command.

**Pure unit tests (Vitest, no `figma`, no DOM):** `src/common/messages.test.ts`
- `isPluginMessage` accepts every fixture value.
- `isPluginMessage` rejects: `null`, `undefined`, `42`, `{}`, `{ type: 'scan-request' }` (no id), `{ id: 'x' }` (no type), `{ type: 'not-a-real-type', id: 'x' }`, and `{ type: 'scan-request', id: 42 }`.
- The fixture array covers all 14 types (assert the set of `fixture.map(m => m.type)` equals the known type set — fails if a type is added without a fixture).

**Compile-time negative tests:** `src/common/messages.type-check.ts` (checked by `npx tsc -b`, not run)
- `@ts-expect-error` on a message with a misspelled `type`, a missing required field (`scan-request` without `scope`), a wrong field type (`overflow-scan-request` with `targetLanguages: 'en'` scalar), and a `request('scan-request', …)` whose awaited value is assigned to the wrong response type.
- One positive line per request pair asserting `request(type, …)` resolves the mapped `RequestResponse[type]`.

**Integration test (dev-only plugin command `__test:roundtrip`, against the running plugin):**
- [ ] For **every** fixture message, drive it across the real bridge and assert the received value **deep-equals** the sent value and narrows on `type` (transport-conformance round trip). For UI→main types, UI `send`s and main echoes the same envelope back for the assertion; for main→UI types, main `send`s and the UI asserts.
- [ ] `request('scan-request', { scope: 'page' })` resolves with the `scan-result` whose `id` matches, and ignores a `scan-result` with a non-matching id.
- [ ] An `error` carrying a pending request's id **rejects** that request's promise.
- [ ] A non-conforming inbound message (`{ foo: 1 }`, and a bare Plugma-style `{ type: 'plugma-dev-event' }`) is dropped by both dispatchers — no handler fires, nothing throws.

**Run:** `npx tsc -b` (proves compile-time safety incl. `type-check.ts`) → `npm test` (guard + fixture-coverage units) → `npm run dev`, then run `__test:roundtrip` in Figma.

**Review focus for the developer:** the single-slot multiplex teardown (unsubscribe actually removes the handler), the request/pending map cleanup on both resolve and reject (no leak), and that guard-and-drop is applied on **both** sides before any handler runs.

---

## Contracts summary

**Produces (LS-2-owned, in `src/common`):** the `Envelope`, the `UiToMain` / `MainToUi` / `AnyMessage` unions, `RequestResponse`, `ScanScope`, `ErrorCode`, `isPluginMessage`; the per-side `send` / `on` / `request` / `respond` / `nextMainId` wrappers.

**Consumes (referenced by owner, not redefined — agent-guidelines §4):** `ScannedTextNode` (LS-3), `ExtractedString` (LS-9), `OverflowVerdict` (LS-8/LS-7), `BlockReason` + `BlockedNode` (LS-4), `PseudoLocOptions` (LS-10), `PreviewMap` (LS-12) — all stood up as canonical stubs in `src/common/models.ts`, expanded in place by their owning specs.

**Upstream note to LS-4:** `BlockReason` is relocated from `src/main/snapshot` (LS-4 example) to `src/common/models.ts`, because the `error` message carries it across the bridge and `src/common` is the only module both threads can import. LS-4 imports it from common rather than declaring it. `BatchResult` may stay main-side (it doesn't cross the wire); only its `blocked` entries do, via `BlockedNode`.

---

## Precision fixes (issue wording — for approval, then a one-time Linear edit)

1. **Success criterion #1** ("wrong shape is a compile error") → *"verified by `@ts-expect-error` negative cases in `src/common/messages.type-check.ts`, checked by `npx tsc -b`."*
2. **Success criterion #2** ("round-trip echo for every message type") → *"a transport-conformance round trip — each of the 14 types serializes, crosses, validates, and deep-equals the original — passes via `__test:roundtrip`."* (One-way commands have no semantic response; the echo tests transport, not semantics.)
3. **Message table:** remove the `export request/result` row — export is UI-local (LS-6); nothing crosses the bridge. Add an `extraction request` row paired with `extraction result` so the result carries a correlation id and LS-9 can trigger it without a transport change.
