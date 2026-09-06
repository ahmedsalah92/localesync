# LS-8.2 — Overflow results panel

The UI half of LS-8. Consumes the measurement engine specced in
[`LS-8.1.md`](./LS-8.1.md) and turns it into the panel the user operates: target-language and
scope selection, a Scan/Stop trigger, streaming results on the shared row, filter and sort,
the `shown of scanned` count, and jump-to-node.

Conventions, the three-part template, the reference-never-redefine rule and every Figma API pin
live in [`../agent-guidelines.md`](../agent-guidelines.md). This spec does not repeat them.

---

## §0 Scope

LS-8 is one Linear issue with two specs. LS-8.1 is the main-thread measurement engine and is
merged. **This spec is the second and final one**, and it covers the panel plus a correction to
the engine.

**The engine correction is in scope here, and it is larger than originally planned.** The Linear
issue requires every flagged row to state its overflow amount in pixels — a product requirement,
not presentation, and the brief §11 install-time-indistinguishability mitigation made visible.
Working out how to produce that number exposed that the shipped fixed-box measurement was
answering the wrong question entirely (§1.1.2). So this spec does not add a magnitude to a
correct verdict; it corrects the verdict and derives the magnitude from the corrected reading.
`LS-8.1.md` §2 and `LS-7.md` §134 both need amending — see §5.

Out of scope: the multi-language matrix, batch across files, the exportable QA report (all
Phase 2); final user-facing copy (LS-14); the performance benchmark and the real node-count
threshold (LS-15); window resize (LS-21); expansion-band calibration (§5 carry-forward 8).

### Upstream types consumed, not redefined

| Type | Owner |
|---|---|
| `OverflowVerdict`, `OverflowVerdictValue`, `OverflowReason` | `src/common/models.ts` — LS-8.1 |
| `ScanScope`, `ErrorCode`, `RequestResponse`, the message union | `src/common/messages.ts` — LS-2 |
| `TextNodeModel` | `src/main/traversal` — LS-3 |
| `ResultsRow`, `RowTone`, `toneToken`, `StateView`, `ShellState`, `ResultsList`, `Dropdown`, `Button`, `ProgressBar`, `Tooltip`, `geometry` | `src/ui/shell` — LS-5 |

---

## §1 Contracts

### 1.1 Engine correction — patches LS-8.1

#### 1.1.1 `OverflowVerdict` gains a magnitude

```ts
// src/common/models.ts — one added field; everything else unchanged.
export interface OverflowVerdict {
	// …existing fields…
	/** Overflow magnitude in px, unrounded. Present only where a magnitude is both meaningful
	 *  and derivable — see §2.1. Absent on `fits`, on every `unmeasurable`, and on
	 *  `maxHeight-cap`, where the hidden amount cannot be measured. */
	overflowPx?: number;
}
```

`language` continues to echo the tag **as the UI sent it**, never the normalised form, so the
panel can match a verdict back to the menu selection that produced it.

#### 1.1.2 The fixed-box branch measures the wrong thing — replace it

Shipped `measure.ts` sets `clone.textAutoResize = 'WIDTH_AND_HEIGHT'` for `NONE` and `TRUNCATE`
nodes, then compares the resulting box against the node's own on both axes. Unlocking the width
stops the text wrapping, so the clone is measured as a single unwrapped line. The LS-7 run
recorded `fixed-overflows` at **1244.0 × 19.0** against a 200 × 40 box — one line 1244px long.

Two consequences, both confirmed by probe against live Figma:

**Figma never overflows text horizontally — it character-wraps.** A 36px-wide auto-height node
given an unbreakable 11-character token of natural width 102px kept `.width` at 36 and grew to
**76px tall**; `absoluteRenderBounds.width` read 26.77, *narrower* than the box. There is no
horizontal overshoot to measure in a constrained read, on any axis, ever. The single-unbroken-token
case — which `expand.ts` produces for every source of 20 characters or fewer, the German
compound-noun case the feature exists for — surfaces as height, not width.

**The unwrapped comparison produces false positives.** A fixed box whose text wraps to two lines
and fits comfortably is measured as one long line and reported `overflows`. From the same probe:
a 60 × 100 box holding a token of natural width 102 gives `102 > 60` unlocked → `overflows`, while
constrained it wraps to roughly two lines, ~38px, well inside 100 → it **fits**. This was live on
`main` and affected the most ordinary case there is.

The constrained read therefore **replaces** the unlocked one rather than supplementing it:

```ts
clone.textAutoResize = 'HEIGHT';    // inherited width kept — wraps exactly as the real node does
clone.textTruncation = 'DISABLED';
for (const candidate of candidates) {
	clone.characters = candidate;
	const needed = clone.height;                    // local dimension, so rotation drops out
	const overshoot = needed - node.height;         // node.height, NOT ownBounds.height
	// overshoot <= EPS → fits; otherwise overflows/truncates with overflowPx = overshoot
}
```

One read per candidate. Verdict and magnitude from the same measurement, on the height axis only.

**Local dimensions, not `ownBounds`.** `TextNodeModel.ownBounds` is `node.absoluteBoundingBox`,
which is axis-aligned and therefore inflated on a rotated node by `w·|cosθ| + h·|sinθ|`. Comparing
an inflated reference against an inflated clone reading looks self-consistent and is not, because
the inflation depends on each box's aspect ratio: a 200 × 40 box at 30° yields a 193.2 × 134.6
reference, and clone content of 210 × 19 yields 191.4 × 121.5 — neither exceeds, so a node that
genuinely does not fit reports `fits`. Reading `clone.height` and `node.height` removes rotation
from the comparison entirely rather than hoping it cancels. Probe confirmed both update
synchronously after a `characters` write, so no yield is required.

`HEIGHT` mode is unaffected — that branch already leaves the clone's inherited mode and width
alone and therefore already measures wrapped.

#### 1.1.3 Language tag resolution

```ts
// src/main/overflow/expand.ts
/** Lowercased primary subtag: 'fr-FR' → 'fr', 'ZH-Hant' → 'zh'. */
export function normalizeLanguageTag(tag: string): string;

/** The single refusal check. Matches on the full tag first, then the primary subtag, both
 *  case-insensitively — so 'ja-JP' and 'zh-TW' are refused, not silently measured. */
export function isUnsupportedLanguage(tag: string): boolean;
```

`UNSUPPORTED_LANGUAGES` keeps its canonical casing as an exported constant; matching goes through a
lowercased internal index built from it. `expansionRatio` resolves its factor by full tag, then
primary subtag, then `DEFAULT_LANGUAGE_FACTOR`. The three direct `.has(…)` call sites in `index.ts`
route through `isUnsupportedLanguage`.

Refusal is checked **before** factor lookup. Without this, a regional tag walks past the CJK
refusal and receives confident pixel verdicts from a character-count model that is wrong for those
scripts — the exact failure LS-8.1 §2 refuses in order to avoid. `UNSUPPORTED_LANGUAGES` already
enumerated `zh-Hans` and `zh-Hant` explicitly, which is the shape of a general case handled in
part.

#### 1.1.4 Streaming, cancellation, and a final progress tick

```ts
// src/main/overflow/index.ts — scanOverflow options gain two members.
onVerdicts?: (chunk: OverflowVerdict[]) => void;   // flushed on the existing 25-node tick
shouldStop?: () => boolean;                        // consulted between nodes
```

`shouldStop` is checked at the top of each node iteration. Breaking between nodes is safe by
construction: `measureOverflow` removes its clone in a `finally`, so an abandoned scan cannot
orphan a clone on the user's page. Cancellation is possible at all only because the loop awaits
`loadFontAsync` and `getNodeByIdAsync` per node and therefore yields to `figma.ui.onmessage`.

**A final progress tick is emitted on completion and on stop.** The shipped guard is
`completed % PROGRESS_EVERY === 0`, so a 30-node scan reports `25 of 30` and never `30 of 30`, and
a scan of fewer than 25 nodes reports nothing at all. The panel's stop copy depends on an exact
`completed`, so the tick is required, not cosmetic.

### 1.2 Message contract — 15 → 17 types

```ts
// src/common/messages.ts
export interface OverflowScanPartial extends Envelope<'overflow-scan-partial'> {
	verdicts: OverflowVerdict[];   // THIS CHUNK ONLY — the UI accumulates.
}

/** Command, not a request: no RequestResponse entry, matching `select-node`. The outcome is the
 *  eventual `overflow-scan-result` carrying `stopped: true`. */
export type OverflowScanCancel = Envelope<'overflow-scan-cancel'>;

export interface OverflowScanResult extends Envelope<'overflow-scan-result'> {
	verdicts: OverflowVerdict[];   // the complete set, including everything already streamed
	stopped?: boolean;             // NEW — true when the scan ended via overflow-scan-cancel
}
```

`OverflowScanPartial` joins `MAIN_TO_UI_TYPES`; `OverflowScanCancel` joins `UI_TO_MAIN_TYPES`.
`messages.fixtures.ts` gains one fixture each and `messages.test.ts`'s `ALL_TYPES` gains both —
the frozen-union count test is the approval record for this change (agent-guidelines §3).

No `found` count crosses the wire: the panel accumulates verdicts and derives it. `completed` and
`total` stay on `progress`, which §1.1.4's final tick makes exact at stop time.

`stopped` lives on the result rather than being inferred UI-side because a cancel sent in the same
tick a scan finishes naturally would otherwise leave the panel asserting a stop that did not happen.

### 1.3 `src/common/overflow.ts` — new, env-neutral

Filtering and sorting run in the UI, and `src/ui/tsconfig.json` references `../common` and nothing
else — so the panel cannot import `severityFor` from `src/main/overflow/verdict.ts`; `npx tsc -b`
fails on it. Nor can the wire `severity` field serve: it is `'warn' | 'error' | undefined`, which
ties `truncates` with `unmeasurable` and leaves `fits` undefined. It is not a total order.

```ts
// src/common/overflow.ts — pure, ambient-free, importable by both threads.
export type OverflowFilter = 'issues' | 'all' | 'overflows' | 'truncates' | 'unmeasurable' | 'fits';
export type OverflowSort = 'severity' | 'document' | 'container' | 'amount';

/** Total order for display. overflows 3 > truncates 2 > unmeasurable 1 > fits 0. */
export function severityRank(verdict: OverflowVerdictValue): number;

/** `'issues'` is every verdict except `fits`; `'all'` is everything; the rest match by name. */
export function matchesFilter(verdict: OverflowVerdict, filter: OverflowFilter): boolean;

/** Returns a new array. Never sorts in place — the input is React state. */
export function sortVerdicts(verdicts: readonly OverflowVerdict[], sort: OverflowSort): OverflowVerdict[];
```

`severityFor` in `src/main/overflow/verdict.ts` is **unchanged**. It produces the wire `severity`
field; it is not a display ordering and never feeds row colour.

### 1.4 `src/ui/bridge.ts` — settlement fix and id exposure

Two related defects, both fixed together because neither works alone.

**`progress` silently resolves `request()`.** The UI bridge settles a pending request on any
inbound message carrying the matching correlation id. `registerOverflow` emits `progress` under
the request's own id — correctly, per LS-2's correlation design — so the first progress tick
resolves the promise with a `ProgressMessage` cast to `OverflowScanResult`, deletes the waiter,
and leaves the real result to arrive at an empty mailbox. The caller reads `verdicts` as
`undefined`. `PROGRESS_EVERY` is 25 and `overflow-spike.fig` originally had 15 rows, so **the acceptance
fixture cannot reach the first tick**: the test passes on exactly the input that cannot fail.

**The correlation id is not reachable.** `request()` mints its id inside the promise closure and
returns only the response; `send()` mints a fresh one per call. So a caller cannot filter
correlated partials or address a follow-up command to the same exchange.

```ts
/** Send a request and expose its correlation id alongside the typed response promise, so callers
 *  can filter correlated `progress` / `overflow-scan-partial` traffic and address follow-up
 *  commands to the same exchange. */
export function requestStream<T extends keyof RequestResponse>(
	type: T,
	fields: Omit<Extract<UiToMain, { type: T }>, 'type' | 'id'>,
): { id: string; response: Promise<RequestResponse[T]> };

/** Unchanged signature — now a thin wrapper over requestStream, so existing callers
 *  (roundtrip.ts, traversal-check.ts, snapshot-check.ts, overflow-check.ts) are untouched. */
export function request<T extends keyof RequestResponse>(…): Promise<RequestResponse[T]>;

/** `id` correlates this message to an existing exchange. Pass only an id the bridge returned
 *  from an earlier `send` or `requestStream`; omit it for a new one. */
export function send<M extends UiToMain>(msg: Omit<M, 'id'>, id?: string): string;
```

The pending entry records its expected response type; the listener settles only when
`message.type === expect` or `'error'`, and anything else falls through to `on()` handlers. That is
also what makes §1.2's streamed partials safe to correlate under the request id.

Minting stays inside the bridge — its docblock states it owns the ids, and `send`'s optional
parameter is documented as *an id the bridge previously returned*, never a caller-minted value.

Fixed at the class, not the instance: LS-9's extraction list and LS-15's added progress on
`scan-request` walk into the same trap. `bridge.type-check.ts` and the `request()` docblock are
updated alongside.

Main side: `registerOverflow` holds the request's `msg.id`, so its `on('overflow-scan-cancel')`
handler compares against it and ignores a cancel addressed to a scan no longer in flight. This
closes a real race — the Stop button unlocks the instant a scan ends while main may still be
breaking out of its loop, so an uncorrelated cancel could kill a scan the user started next.

### 1.5 `src/ui/shell/bands.tsx` — new

LS-5 §1.5 declares `ControlBar` and `SummaryBar` in this file. The file is not on main: the shell's
own Plugin Header band was deleted during LS-5 visual QA because it duplicated Figma's
non-suppressible window chrome, and the two other exports went with it. The header stays deleted
and canvas-only (LS-5 §5.7); these two duplicate nothing Figma provides.

```ts
export function ControlBar(props: { children: ReactNode }): JSX.Element;

export function SummaryBar(props: {
	count: string;
	tone?: 'default' | 'secondary';   // populated vs in-flight
	controls?: ReactNode;              // Show/Sort cluster, or the `N found` yield
	progress?: number | null;          // 0–1 determinate; null = indeterminate (see §2.4)
}): JSX.Element;
```

Both bands are 40px with a bottom `border/default` divider and a 16px horizontal inset, per the
`BAND_HEIGHT` rhythm in `geometry.ts`. `SummaryBar` owns the count's typography and selects it from
`tone` — the LS-5 signature left `count` as a bare `ReactNode`, which would have made every caller
restate the type ramp.

### 1.6 Primitive amendments

`Dropdown`, `Button` and `ProgressBar` have **zero call sites** on main — only `Tooltip` is used, by
`ResultsRow` — so these reshape without migration and cannot regress anything.

```ts
export function Dropdown(props: {
	label: string;
	value: string;
	options: readonly { value: string; label: string; disabled?: boolean; group?: string }[];
	onChange: (value: string) => void;
	stroke?: boolean;        // default true. false = the borderless summary-bar treatment.
	prefixLabel?: boolean;   // default true. false = bare value, for control-bar selects.
	fill?: boolean;          // default false (hug).
	disabled?: boolean;
}): JSX.Element;
```

`stroke` is not invented here: design.md records the canvas component as `Dropdown, Stroke=False`
for Show/Sort, on the reasoning that the two bands *"share one control with two treatments rather
than two hand-built lookalikes."* `group` renders `<optgroup>`; `disabled` on an option renders a
disabled `<option>` — both free, because the control is a native `<select>`.

Two straight code-vs-canvas defects are fixed in passing: `Dropdown` and `Button` both hardcode
`--radius-medium`, where design.md binds `Radius/radius-small` to *"Control Bar selects and the Scan
button"*; and `Button`'s `secondary` variant is transparent-with-border, where the Stop button is a
`bg/secondary` **fill** with a `text/default` label.

`ProgressBar` is unchanged — 2px, `--ls-bg-brand` on `--ls-bg-secondary`, full width.

### 1.7 Shell composition

`Shell.tsx` renders `<ResultsList hasFooter={…}><Panel /></ResultsList>` — the panel sits *inside*
the scroll container. A panel with fixed bands cannot exist in that structure: its control and
summary bars would scroll away with its rows. The same structure is why a panel cannot hide the
footer, which the canvas requires in both empty states and during scanning.

`PanelDef.Panel` takes ownership of everything below the tab bar:

```ts
export interface PanelDef {
	id: PanelId;
	label: string;
	Panel: ComponentType;   // owns its own bands, scroll region and footer
}
```

`Shell` renders `<AppliedBanner /><TabBar /><Panel />`. `ResultsList` becomes a component panels use
for their rows region. `PanelDef.Footer` is removed; stub panels use a small helper that composes
`StateView` with the Pro-stub footer so their current appearance is preserved exactly.
`geometry.ts`'s arithmetic is unchanged and remains the documented reference for band heights.

**The dev harness must survive this restructure.** `<DevHarness />` mounts at `Shell.tsx` under
`import.meta.env.DEV`; a sibling of a `flex: 1` panel is collapsed to zero height and silently
disappears. A dev harness that renders nothing is how a fixture goes six weeks without
regeneration — see §5 carry-forward 5.

### 1.8 `src/ui/overflow/` — the panel

New folder, matching the `src/ui/export/` (LS-6) convention in the agent-guidelines §1 map, which
gains a line for it.

| File | Holds |
|---|---|
| `OverflowPanel.tsx` | the panel component; composes `ControlBar`, `SummaryBar`, `ResultsList`, `ResultsRow`, `StateView` |
| `state.ts` | the pure scan-state reducer and its derived selectors |
| `copy.ts` | every user-facing string, so LS-14's pass is a single-file edit |

```ts
// src/ui/overflow/state.ts
export type ScanPhase = 'idle' | 'scanning' | 'done' | 'stopped' | 'failed';

export interface OverflowState {
	phase: ScanPhase;
	language: string;              // bare subtag; the value sent in targetLanguages
	scope: ScanScope;
	filter: OverflowFilter;
	sort: OverflowSort;
	verdicts: OverflowVerdict[];   // accumulated across partials, replaced by the final result
	completed: number;
	total: number;                 // 0 until the first progress tick — see §2.4
	selectedNodeId: string | null;
	errorCode: ErrorCode | null;
}

export type OverflowAction =
	| { kind: 'set-language'; language: string }
	| { kind: 'set-scope'; scope: ScanScope }
	| { kind: 'set-filter'; filter: OverflowFilter }
	| { kind: 'set-sort'; sort: OverflowSort }
	| { kind: 'scan-started' }
	| { kind: 'progress'; completed: number; total: number }
	| { kind: 'partial'; verdicts: OverflowVerdict[] }
	| { kind: 'result'; verdicts: OverflowVerdict[]; stopped: boolean }
	| { kind: 'failed'; code: ErrorCode }
	| { kind: 'select'; nodeId: string };

export function overflowReducer(state: OverflowState, action: OverflowAction): OverflowState;

/** Filter, then sort, over a copy. The rendered rows. */
export function visibleVerdicts(state: OverflowState): OverflowVerdict[];
```

The reducer is pure and DOM-free so it unit-tests under Vitest without jsdom
(agent-guidelines §6).

---

## §2 Resolved Defaults

Use exactly these. No choice below is left open.

### 2.1 `overflowPx` arithmetic

Let `node` be the live text node's local dimensions, `container` the immediate parent's bounds,
`available` the offset-aware container height already computed by `measure.ts`.

| `reason` | Reference | `overflowPx` | Axis |
|---|---|---|---|
| `exceeds-fixed-box` | `node.height` | `constrainedHeight − node.height` | height |
| `truncated-fixed-box` | `node.height` | `constrainedHeight − node.height` | height |
| `exceeds-container-height` | `available` | `measuredHeight − available` | height |
| `parent-escape` | `container` | `max(w − container.w, h − container.h)` | either |
| `maxLines-cap` | capped height | `freeHeight − cappedHeight` | height |
| `maxHeight-cap` | — | **field omitted** | — |
| `no-container`, `fits` | — | field omitted | — |
| every `unmeasurable` reason | — | field omitted | — |

Fixed-box and auto-height are height-only because Figma character-wraps rather than overflowing
horizontally (§1.1.2). Hug retains a two-axis comparison because a hug node is unconstrained and
genuinely can escape its parent sideways.

Values are floats, unrounded on the wire. The panel ceils at render: a 0.4px overshoot rounding to
`overflows 0px` would restate the very problem the delta exists to make visible, and `1px` is at
least true. Sorting uses the raw value.

**`maxHeight-cap` omits the field because the magnitude is not knowable.** The clone inherits the
cap; clearing it with `maxHeight = null` is silently rejected outside auto-layout — LS-7 run 3
measured exactly `200.0 × 50.0` after the clear and a forced re-layout — so free growth is pinned at
the cap and the hidden height cannot be reached. `max(0, free − maxHeight)` yields 0, and rendering
`clips 0px` asserts a measurement never taken. The verdict is still sound: it rests on the
binding-agnostic rule that content *reaching* the cap proves the cap is active. Reaching is
observable; the distance beyond is not.

### 2.2 Language resolution and menu

Resolution order, all comparisons lowercased: refusal on the full tag → refusal on the primary
subtag → factor on the full tag → factor on the primary subtag → `DEFAULT_LANGUAGE_FACTOR`.

**Values are bare subtags. Labels are English names with no regional tag** — after normalisation the
canvas's `fr-FR` advertises a distinction the engine deliberately discards.

*Selectable (12):* German `de` **(default)** · Spanish `es` · Finnish `fi` · Dutch `nl` ·
Polish `pl` · Russian `ru` · Portuguese `pt` · French `fr` · Italian `it` · Hebrew `he` ·
Turkish `tr` · Arabic `ar`.

*Disabled, shown with a reason (5):* Japanese `ja` · Korean `ko` · Chinese (Simplified) `zh-Hans` ·
Chinese (Traditional) `zh-Hant` · Thai `th`.

German is the default, not the canvas's French. French carries factor 0.95, the second-lowest in the
table — the weakest possible first run for a tool whose pitch is catching what shallow tools miss.
German is 1.15, the canonical expansion case, and the brief's own content angle.

Showing the refused languages rather than hiding them turns the limit into the sharpest available
statement of engine depth. The menu is not the enforcement — `isUnsupportedLanguage` is, and it
stays load-bearing because LS-12 can feed `ja` in from an imported translation file.

### 2.3 Control bar

| Slot | Sizing | Treatment |
|---|---|---|
| Language select | `FILL` | bordered, `radius-small`, `prefixLabel: false` |
| Scope select | `HUG` 88px | bordered, `radius-small`, `prefixLabel: false`, options `Page` (default) / `Selection` |
| Scan button | `HUG` | primary — `bg/brand` fill, `text/onbrand` label |

Scan **becomes Stop in the same slot** mid-scan — `bg/secondary` fill, `text/default` label,
secondary rather than danger, because stopping abandons work in progress without destroying
anything. Both selects are `disabled` while a scan runs and unlock the moment it ends, stopped or
complete. 8px gap, 16px inset.

### 2.4 Summary bar

**The count sizes to its content.** `flex: 0 0 auto` on the count; Show and Sort take the remainder
and stay right-aligned against it. Inverting this clips the count to `15…` in the populated state
and mangles the far longer scanning string.

*Populated / all-nodes:* count `24 of 32` — `shown of scanned` — at `text/default`, weight strong.
Right-aligned Show and Sort, `stroke: false`, `prefixLabel: true`, sized to their own labels
(80–114px), 8px gap.

*Scanning, total known:* `Scanning… 1,284 of 3,410 nodes` at `text/secondary`; Show and Sort
**removed**, replaced by a right-aligned `6 found` yield derived from accumulated verdicts;
`progress` set to `completed / total`.

*Scanning, total not yet known:* traversal runs before `total` arrives, and the band must not read
`Scanning… 0 of 0 nodes` — that asserts an empty page while claiming to scan it. Until the first
`progress` message carries a non-zero `total`, show `Scanning…` with no numbers and pass
`progress: null` for an indeterminate bar. Observed duration on a 485-node page: roughly two
seconds.

### 2.5 Filter and sort

*Show menu* — labels then values: `Issues` → `issues` (default) · `All nodes` → `all` ·
`Overflows` → `overflows` · `Clips` → `truncates` · `Un-measurable` → `unmeasurable` ·
`Fits` → `fits`.

`issues` is **every verdict except `fits`**. Un-measurable rows belong under issues, and the empty
state's claim *"All 32 nodes fit their containers"* is only honest because they do.

*Sort menu:* `Severity` → `severity` (default) · `Document order` → `document` ·
`Container` → `container` · `Overflow amount` → `amount`.

| Sort | Order | Ties |
|---|---|---|
| `severity` | `overflows` → `truncates` → `unmeasurable` → `fits` | document order |
| `document` | array order as received from `scanOverflow` | — |
| `container` | `containerLabel.localeCompare` ascending | document order |
| `amount` | `overflowPx` descending → flagged rows without a delta → unflagged rows | document order |

`unmeasurable` ranks above `fits` because a node that could not be checked is not a node that
passed. It ranks below `truncates` because a truncation is a confirmed layout consequence and an
unmeasurable node is an unknown.

Severity ties break on document order, **not on magnitude**. Folding magnitude into the severity
sort would make two of the four options nearly identical and leave no way to get stable triage
order.

`maxHeight-cap` rows sort above unflagged rows in `amount` despite carrying no delta — a flagged row
sinking beneath `fits` rows in a magnitude sort reads as a bug.

Filter runs first, then sort, over a copy.

### 2.6 Row rendering

`tone` is the verdict itself — the row is keyed on `OverflowVerdictValue`, which already carries
four values, so no widening and no projection layer is needed. `monoMeta` stays false; it is LS-9's.

**The meta line is two elements, never one string.** A concatenated string lets a long container
path consume the whole line and truncate away the verdict and the pixel delta — the one thing the
Linear issue requires every flagged row to state. Observed live on a real file:
`Section — Plugin Header / Figma host chrome — not p…`, with no verdict and no magnitude.

```
[ containerLabel ]            [ • verdict Npx ]
flex: 1 1 auto                flex: 0 0 auto
min-width: 0                  never truncates
ellipsis on overflow
```

`verdict` is the canvas vocabulary — `fits` · `clips` · `overflows` · `un-measurable`. `Npx` is
`Math.ceil(overflowPx)` when the field is present and absent otherwise. `ResultsRow` therefore takes
`meta` as `{ label: string; verdict: string; tooltip?: string }` rather than a prepared string;
assembly moves out of the panel.

**2026-09-06 — LS-25:** On an `unmeasurable` row, the verdict chunk now names the engine reason
instead of repeating the generic verdict, and may carry a wrapping tooltip with the explanation.
The optional tooltip stays inside the fixed verdict sibling, so the container label remains the
only part of the meta line that yields or truncates.

**Rows span the list's full width.** Per `184:96`: strip at x=0, 3px wide, full row height; content
inset 16px left and right; jump 16×16 ending 16px from the right edge. No inset may be applied to
the row that is not also applied to its divider.

**The jump affordance needs a usable target.** `ArrowIcon` is a 16×16 SVG whose path carries
`transform="translate(3, 3)"` over a ~10×10 shape, so visible ink is roughly 10×10 — painted at
`--ls-icon-secondary`, with no hover state and a 16×16 hit area. Keep the glyph at UI3's 16×16 spec;
give the button a 24×24 hit area via negative margin so layout is unchanged, and a hover state that
lifts the icon to `--ls-icon-default` over `--ls-bg-hover` at `--radius-small`.

**The row label and the wire value differ, and that is settled.** The component set's variant
property reads `Severity=Truncates`, matching `OverflowVerdictValue`; the text inside that variant
reads `clips 8px`. The variant name is implementer-facing and must match the union; the copy is
better English. `primary` is the source string.

Clicking a row selects it (`bg/selected`). The jump affordance sends `select-node`; a `node-gone`
error surfaces as `operation-failed`.

### 2.7 States

| Condition | Surface |
|---|---|
| before any scan | `StateView state="first-run"` |
| selection scope, empty selection | `no-selection` |
| scope held no eligible text nodes | `no-text-on-page` |
| **every** eligible node unmeasurable **for font reasons** | `fonts-unavailable` |
| node count over the advisory threshold, pre-scan | `large-file` |
| `mutation-failed` / `internal` / `node-gone` | `operation-failed`, with its `Try Again` action |
| stop produced **zero** rows | `scan-stopped` |
| stop produced rows | rows retained; the stop is reported in the summary bar |
| scan completed, filter yields nothing | `no-issues` |

`fonts-unavailable` is keyed on the **reason**, not merely on "all unmeasurable" — a scan where
every row came back `no-bounds` or `unsupported-language` must not claim fonts. And it fires only
when unloadable fonts are the whole story: a full-surface state that hides 29 good rows to report
3 bad ones is wrong, and those nodes already appear as `unmeasurable` rows.

`ShellState` gains `'no-issues'`. `No issues found / All 32 nodes fit their containers` is a designed
surface — its own canvas shell — but not one of the seven values in the merged enum. It cannot reuse
`no-text-on-page`: one says thirty-two nodes were checked and passed, the other says there was
nothing to check, and collapsing them undoes the distinction the green `fits` strip exists to make.

**A stop with results is not an empty state.** The user pressed Stop; they did not discard work. The
progress bar is removed, the selects unlock, the button reverts to Scan, and the rows stay.

The threshold behind `large-file` is **advisory at 500 and never blocks a scan** — provisional, to be
replaced by the LS-15 time-budget benchmark. Measured throughput of ~45 nodes/second (§3.5) makes
500 nodes roughly an 11-second scan.

The footer is hidden in every `StateView` state and throughout scanning, and shown only in the
panel's working states.

### 2.8 Scan lifecycle

1. Scan pressed → `scan-started`; selects disable; Scan becomes Stop; Show and Sort leave the
   summary bar; the footer hides;
   `const { id, response } = requestStream('overflow-scan-request', { scope, targetLanguages: [language] })`.
2. `progress` and `overflow-scan-partial` are filtered on that `id`. Each tick updates the count and
   bar; each partial appends its chunk and rows appear beneath the bands.
3. Stop pressed → `send({ type: 'overflow-scan-cancel' }, id)`. The panel does not change phase on
   send; it waits for the result.
4. Resolution → `overflow-scan-result` replaces the accumulated array with the complete set and
   sets the phase from `stopped`.
5. `error` at any point → `failed`, with the code mapped per §2.7.

**On unmount, the panel sends the cancel.** `Shell` renders only the active panel, so switching tabs
mid-scan unsubscribes the handlers and orphans the promise while main keeps scanning; on return the
panel reads idle and the results are unreachable. Cancelling is the honest minimal behaviour — the
work cannot be displayed anyway, and a scan running invisibly is worse than a stopped one. Hoisting
scan state above the panel is the alternative and belongs with LS-15.

`targetLanguages` is always a one-element array — the §3 carve-out shape, never a scalar.

### 2.9 Copy

Every user-facing string lives in `src/ui/overflow/copy.ts`, taken verbatim from the DES-1 state
matrix and the canvas. LS-8.2 owns the *format*; LS-14 owns the *words* and edits one file.

---

## §3 Concrete Acceptance

### 3.1 Pure unit tests — `npm test`

**`src/common/overflow.test.ts`** (new)
- `severityRank` is a strict total order over all four `OverflowVerdictValue` members.
- `matchesFilter` — all six filters × all four verdicts = 24 assertions; `issues` admits exactly
  `overflows`, `truncates`, `unmeasurable`.
- `sortVerdicts` — each of the four modes; `amount` places a `maxHeight-cap` row above every `fits`
  row and below every row carrying a delta; every mode breaks ties on document order; the input
  array is not mutated.

**`src/main/overflow/expand.test.ts`** (extended)
- `isUnsupportedLanguage('ja-JP')`, `('zh-TW')`, `('JA')`, `('th-TH')` all true — the regional-tag
  hole is the point of these cases.
- `expansionRatio(n, 'fr-FR') === expansionRatio(n, 'fr')` and `('de-AT') === ('de')`.
- An unknown tag still falls to `DEFAULT_LANGUAGE_FACTOR`.

**`src/ui/overflow/state.test.ts`** (new)
- `idle → scanning → done`; `scanning → stopped` via a result with `stopped: true`;
  `scanning → failed`.
- Partials accumulate in arrival order; the final result replaces rather than appends, so a verdict
  streamed and then re-sent does not appear twice.
- `visibleVerdicts` applies filter then sort and never mutates `state.verdicts`.
- The derived found-count equals the accumulated non-`fits` count.

### 3.2 In-Figma engine passes — `npm run dev`, *Run LS-8 overflow check*

Against `fixtures/overflow-spike.fig`. **Recorded result: 34 of 35 green.**

Pass 3 asserts the presence rule — every flagged row carries `overflowPx` except `maxHeight-cap`; no
`fits` or `unmeasurable` row carries one; every present value is `> 0`; `hug-page-parent` stays
`fits` / `no-container` with no delta.

**Pass-3 baseline, recorded live:**

```
fixed-overflows       overflows / exceeds-fixed-box   38.00px   "Save"
autoheight-maxlines   truncates / maxLines-cap        19.00px   "Continue to checkout"
```

`fixed-overflows` measured **~1044px** under the pre-correction unwrapped comparison. The gap
between 1044 and 38 is the whole of §1.1.2 in one number, and it belongs in the PR description.

`fixed-wraps-fits` — a `NONE` box wide enough that the expanded string wraps to two lines and still
fits — returns `fits`. That row is the regression test for the false positive and did not exist
before this spec.

The `ja` refusal returns every row `unmeasurable` / `unsupported-language`, at a row count matching
the `de` scan exactly.

**The one failure is a known manual step**, not a defect: `pass1 missing-font — missing from
traversal output`. The node uses an unavailable family (`Fontine`) that the generator cannot create,
and regenerating the fixture wiped the hand-made one. The capability was verified against the
pre-regeneration fixture, where it reported `un-measurable` correctly. See §5 carry-forward 4.

### 3.3 Bridge regression

The `progress`-settles-`request()` defect cannot be caught by Vitest — `src/ui/bridge.ts` touches
`window` at module scope and agent-guidelines §6 rules out jsdom. Covered by:
- a `bridge.type-check.ts` addition asserting the pending entry's expected-response typing; and
- a scan of **more than 25 nodes** resolving with a populated `verdicts` array. Run against a real
  page, not `overflow-spike.fig` — even its 17 eligible text nodes after manual setup cannot reach
  the first tick, which is why the defect went unnoticed.

### 3.4 Panel review against canvas

Checked against `🧩 Plugin — Phase 1`: populated shell, All Nodes shell (`258:393`), empty state,
Scanning shell (`266:839`), `Results Row` set (`184:96`), control bar (`253:308`), summary bar
(`185:57`).

- [ ] Bands stay fixed; only rows scroll.
- [ ] Rows span the full list width; strip flush left; 16px insets.
- [ ] The delta is visible on every flagged row, including deep container paths.
- [ ] The count renders in full in both populated and scanning states.
- [ ] The jump icon is legible, hoverable, and has a 24px target.
- [ ] Scan/Stop occupy one slot; selects lock and unlock.
- [ ] Rows appear during the scan; the yield count climbs; the bar is determinate once `total` is
      known and shows no `0 of 0` before it.
- [ ] A stop keeps its rows.
- [ ] Show and Sort are borderless; control-bar selects are bordered at `radius-small`.
- [ ] The footer is absent in every empty state and during scanning.
- [ ] Japanese is not selectable; its reason is legible.

**`overflow-spike.fig` cannot validate panel verdicts.** Only three rows carry authored text; the
rest hold a twelve-character `Source label` that German-expands to something any 200px auto-height
node swallows, so `autoheight-overflows` correctly reports `fits` on a real scan. The names describe
harness-injected candidates. Panel verdict correctness needs LS-17's `known-overflow` fixture, which
does not exist yet — see §5 carry-forward 6.

### 3.5 Observed throughput

A 485-node page scans in roughly eleven seconds — ~45 nodes/second, measured from the 25-node tick
at ~2.5s to 475 nodes at ~12.5s. First real throughput figure for LS-15; a 2,000-node file projects
to about 45 seconds.

**Run:** `npm test`, then `npx tsc -b`, then `npx eslint .`, then `npm run dev` for §3.2–3.5.

---

## §4 API pins

Per [`../agent-guidelines.md`](../agent-guidelines.md) §2. Nothing repeated here. The surfaces this
spec leans on are `figma.ui.onmessage` delivery during an awaiting loop, the `maxHeight`
write-rejection outside auto-layout, `textAutoResize`'s four values including `TRUNCATE` as a live
value, and two behaviours confirmed by probe rather than documentation: local `width`/`height`
update synchronously after a `characters` write, and Figma character-wraps unbreakable tokens rather
than overflowing horizontally.

---

## §5 Carry-forward register

| # | Item | Lands in |
|---|---|---|
| 1 | **Stop is unverified.** The streaming path, progress, yield count and bar are confirmed on a 485-node page; Stop was never clicked. Verify: rows retained, bar removed, selects unlocked, button reverted, `stopped: true` on the result. | before merge |
| 2 | `LS-7.md` §134 specified the unlocked fixed-box read (`clone.textAutoResize = 'WIDTH_AND_HEIGHT'`) and the two-axis comparison against `ownBounds`. That is where the false positive originated. Annotate with a dated note — it is the record of a closed spike, and its observations (`1244.0 × 19.0`) remain true, just understood differently. The spike's headline verdict, Approach A, is unaffected. | doc annotation |
| 3 | `LS-8.1.md` §2's fixed-box rule now misdescribes the code. Correct it properly rather than annotating — a spec that misdescribes its own module is worse than one carrying a note. | doc correction |
| 4 | **Closed 2026-09-06.** The fixture README now gives one standing workflow for `missing-font` and `mixed-font-missing`; fresh generation reports both rows missing until they are rebuilt with an unavailable family. | fixture enhancement |
| 5 | `<DevHarness />` rendered nothing after the §1.7 restructure, which is why the fixture went six weeks without regeneration. Keep a smoke check that the harness is reachable in DEV builds. | LS-17 |
| 6 | `truncate-overflows`, `autoheight-overflows` and `hug-overflows` carry `Source label` and correctly report `fits` on a real scan — their names describe harness-injected candidates and read as engine bugs in the panel. Rename or annotate. Panel verdict validation needs `known-overflow`. | LS-17 |
| 7 | Native `<select>` prefixes the open option list as well as the trigger; the trigger is correct and the list reads `Show: issues · Show: all`. A custom popover was rejected in LS-5 §3.2 because `bg/menu/default` has no live binding. | LS-14 or a kit pass |
| 8 | **Expansion bands are uncalibrated against real translations.** `"Extract"` (7 chars) expands to a 19-character candidate — `1 + 1.5 × 1.15 = 2.725` — where German *Extrahieren* is 11. 172% modelled against 57% real, roughly 3× the true overflow; a real design file returned a 34% flag rate. The bands are midpoints of IBM/W3C ranges, but those are **design-reserve** guidance, not per-word prediction, while the panel promises prediction. Validate against 50–100 real strings; band 1 first, since it covers every button and label. `expansionRatio` is the single edit point. | **launch-blocking, own issue** |
| 9 | `maxHeight-cap` rows carry a verdict but no magnitude. If Figma ever permits clearing the cap off auto-layout, the row gains a delta with no contract change. | future API |
| 10 | The height-only rule cannot see a box narrower than a single glyph, where wrapping is impossible and the text renders horizontally. Vanishingly rare; the probe did not reach it. | open |
| 11 | `docs/design.md`'s "Resolved" entry claims hug nodes parent-walk to a constrained ancestor and that hug-with-no-constrained-ancestor is un-measurable. LS-7 §2 resolved immediate-parent-only with `no-container → fits`, which `measure.ts` and `hug-page-parent` implement. Stale; needs a correction note. | doc fix |
| 12 | `docs/specs/LS-8.md` → `docs/specs/LS-8.1.md`; the Linear issue's spec pointer follows. | Linear precision fix |
| 13 | agent-guidelines §1 folder map gains `src/ui/overflow/ LS-8` and `src/common/overflow.ts`. | doc fix |
| 14 | LS-5 §1.5 records `bands.tsx` with three exports; the file shipped with none. The header stays deleted; the note should record that the other two were collateral. | LS-5 precision fix |
| 15 | The summary count uses `verdicts.length` as "scanned" — exact at one language per node, wrong for the Phase 2 matrix, where it becomes nodes × languages. | Phase 2 |
| 16 | The un-measurable reason tooltip is hover-only because its `<span>` trigger is not keyboard-focusable. Giving every result row a second tab stop is the worse trade-off until the interaction is designed as part of the accessibility pass. | LS-14 accessibility pass |

Carry-forwards 1 and 7 from `LS-8.1.md` §5 are **closed by this spec**. Carry-forward 1's
`--overflow` reference was stale on arrival — superseded by the UI3 ramp, which `ResultsRow`
implements as `--ls-icon-success` / `--ls-icon-warning` / `--ls-icon-danger` / `--ls-icon-tertiary`.
The remaining LS-8.1 carry-forwards stay where they are.

## §6 Precision fixes proposed to LS-8

1. **Spec pointer.** The issue names `docs/specs/LS-8.md`. It becomes the `LS-8.1` / `LS-8.2` pair.
2. **The px criterion.** *"Every flagged row states the overflow amount in px"* should note that it
   covers `overflows` and `truncates`, and that `maxHeight-cap` is a named exception — so the
   criterion is testable rather than aspirationally universal.
3. **Record the false positive.** The criterion *"every safe node is not flagged"* was being violated
   on `main`: any fixed box whose text wrapped to two lines and fitted reported `overflows`. The
   defect and its fix belong in the issue's history, not only in a commit message.

**Not proposed:** clearing the `blockedBy` relations to LS-5, LS-7, LS-17 and LS-19. A relation
pointing at a Done issue is satisfied, not stale, and removing it erases the dependency record.
