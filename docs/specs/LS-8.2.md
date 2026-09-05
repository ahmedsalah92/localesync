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
merged. **This spec is the second and final one**, and it covers the panel plus one amendment to
the engine.

**The engine amendment is in scope here, deliberately.** The Linear issue requires every flagged
row to state its overflow amount in pixels — a product requirement, not presentation, and the
brief §11 install-time-indistinguishability mitigation made visible. The merged `OverflowVerdict`
carries `measuredWidth` / `measuredHeight` but no magnitude, and the magnitude cannot be derived
UI-side (§1.1 explains why it cannot even be derived from those two fields). The amendment is
therefore specced here, in the same document as its only consumer, and `LS-8.1.md` §2 carries a
pointer to it so the measurement protocol is not silently stale.

Out of scope: the multi-language matrix, batch across files, the exportable QA report (all
Phase 2); final user-facing copy (LS-14); the performance benchmark and the real node-count
threshold (LS-15); window resize (LS-21).

### Upstream types consumed, not redefined

| Type | Owner |
|---|---|
| `OverflowVerdict`, `OverflowVerdictValue`, `OverflowReason` | `src/common/models.ts` — LS-8.1 |
| `ScanScope`, `ErrorCode`, `RequestResponse`, the message union | `src/common/messages.ts` — LS-2 |
| `TextNodeModel` | `src/main/traversal` — LS-3 |
| `ResultsRow`, `RowTone`, `toneToken`, `StateView`, `ShellState`, `ResultsList`, `Dropdown`, `Button`, `ProgressBar`, `Tooltip`, `geometry` | `src/ui/shell` — LS-5 |

---

## §1 Contracts

### 1.1 Engine amendment — patches LS-8.1

#### 1.1.1 `OverflowVerdict` gains a magnitude

```ts
// src/common/models.ts — one added field; everything else unchanged.
export interface OverflowVerdict {
	// …existing fields…
	/** Overflow magnitude in px, unrounded. Present only where a magnitude is both meaningful
	 *  and derivable — see LS-8.2 §2.1. Absent on `fits`, on every `unmeasurable`, and on
	 *  `maxHeight-cap`, where the hidden amount cannot be measured. */
	overflowPx?: number;
}
```

`language` continues to echo the tag **as the UI sent it**, never the normalised form, so the
panel can match a verdict back to the menu selection that produced it.

#### 1.1.2 Fixed-box modes need a second measurement

> **Superseded 2026-09-05 by a live probe — this subsection is kept as the record, not the
> instruction.** The premise below is wrong: it assumes a fixed box can be overflowed horizontally.
> It cannot. **Figma never overflows text horizontally — it character-wraps.** Probed live: a 36 px
> box given a 102 px unbreakable token kept `.width` at 36 and grew to 76 px tall.
>
> That makes the *verdict* logic this subsection preserves ("the verdict still comes from the first
> read") a false-positive generator, not just an unusable source of magnitude: any fixed box whose
> text wrapped to two lines and fitted was reported `overflows`, because the unlocked clone's
> unwrapped width was compared against the box.
>
> **What ships instead: one read, height axis only.** The clone goes to `HEIGHT` keeping its
> inherited width, so it wraps exactly as the real node does; the verdict is `clone.height >
> node.height + EPS` and `overflowPx` is `clone.height − node.height` from that same read. No second
> read, no width comparison, no rotation special-case — local dims are unrotated on both sides, so
> the `rotated-fixed` row needs nothing. The regression is the `fixed-wraps-fits` fixture row.
>
> The rest of §1.1 (the `overflowPx` field, tag resolution, streaming) is unaffected.

`measure.ts` currently unlocks the clone to `WIDTH_AND_HEIGHT` and clears truncation. That is
correct for the *verdict* — it answers "does the content fit" — but the numbers it yields cannot
produce the magnitude, because an unlocked clone stops wrapping. The LS-7 run recorded
`fixed-overflows` at **1244.0 × 19.0** against a 200 × 40 box: a single unwrapped line. Subtracting
gives 1044px, the length of a line the user will never see, where the real overshoot of the wrapped
text is on the order of tens of pixels.

`NONE` and `TRUNCATE` nodes therefore take a **second read**: clone set to `HEIGHT` at
`ownBounds.width`, candidate applied, width and height read. The verdict still comes from the first
read; only `overflowPx` comes from the second.

The second read must compare on **both axes**, not height alone. A wrapped phrase overshoots the
box height; a single unbroken token — which is exactly what `expand.ts` produces for any source of
20 characters or fewer, the German compound-noun case the feature exists for — cannot wrap and
overshoots the box *width*. Taking the larger of the two positive overshoots selects the triggering
axis without recording which one it was, and matches the arithmetic already used for
`parent-escape`.

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

Refusal is checked **before** factor lookup. Without this, a regional tag walks straight past the
CJK refusal and receives confident pixel verdicts from a character-count model that is wrong for
those scripts — the exact failure LS-8.1 §2 refuses in order to avoid.

#### 1.1.4 Streaming, cancellation, and a final progress tick

```ts
// src/main/overflow/index.ts — scanOverflow options gain two members.
onVerdicts?: (chunk: OverflowVerdict[]) => void;   // flushed on the existing 25-node tick
shouldStop?: () => boolean;                        // consulted between nodes
```

`shouldStop` is checked at the top of each node iteration. Breaking between nodes is safe by
construction: `measureOverflow` removes its clone in a `finally`, so an abandoned scan cannot orphan
a clone on the user's page. Cancellation is only possible at all because the loop awaits
`loadFontAsync` and `getNodeByIdAsync` per node and therefore yields to `figma.ui.onmessage`.

**A final progress tick is emitted on completion and on stop.** Today the guard is
`completed % PROGRESS_EVERY === 0`, so a 30-node scan reports `25 of 30` and never `30 of 30`, and a
scan of fewer than 25 nodes reports nothing at all. The panel's stop copy depends on an exact
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
`messages.fixtures.ts` gains one fixture each and `messages.test.ts`'s `ALL_TYPES` gains both
entries — the frozen-union count test is the approval record for this change
(agent-guidelines §3).

No `found` count crosses the wire: the panel accumulates verdicts and derives it. `completed` and
`total` stay on `progress`, which §1.1.4's final tick makes exact at stop time.

`stopped` lives on the result rather than being inferred UI-side because a cancel sent in the same
tick a scan finishes naturally would otherwise leave the panel asserting a stop that did not happen.

### 1.3 `src/common/overflow.ts` — new, env-neutral

Filtering and sorting run in the UI, and `src/ui/tsconfig.json` references `../common` and nothing
else — so the panel physically cannot import `severityFor` from `src/main/overflow/verdict.ts`;
`npx tsc -b` fails on it. Nor can the wire `severity` field serve: it is
`'warn' | 'error' | undefined`, which ties `truncates` with `unmeasurable` and leaves `fits`
undefined. It is not a total order.

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

### 1.4 `src/ui/bridge.ts` — the `request()` settlement fix

The UI bridge settles a pending request on *any* inbound message carrying the matching correlation
id. `registerOverflow` emits `progress` under the request's own id, correctly per LS-2's correlation
design — so the first progress tick resolves the `request('overflow-scan-request', …)` promise with
a `ProgressMessage` cast to `OverflowScanResult`, deletes the waiter, and the real result arrives to
find nothing waiting. The caller reads `verdicts` as `undefined`.

`PROGRESS_EVERY` is 25 and `overflow-spike.fig` has 14 rows, so **the acceptance fixture passes and
real files fail**. Nothing on main triggers it today because LS-8.2 is the first `request()` caller
for this pair.

The pending entry records its expected response type. The listener settles only when
`message.type === expect` or `message.type === 'error'`; anything else falls through to the
registered `on()` handlers. This is what also makes §1.2's streamed partials safe to correlate under
the request id.

Fixed at the class, not the instance: LS-9's extraction list and LS-15's added progress on
`scan-request` walk into the same trap. `bridge.type-check.ts` and the `request()` docblock are
updated alongside.

### 1.5 `src/ui/shell/bands.tsx` — new

LS-5 §1.5 declares `ControlBar` and `SummaryBar` in this file. The file is not on main: the shell's
own Plugin Header band was deleted during LS-5 visual QA because it duplicated Figma's
non-suppressible window chrome, and the two other exports went with it. The header stays deleted and
canvas-only (LS-5 §5.7); these two do not duplicate anything Figma provides.

```ts
export function ControlBar(props: { children: ReactNode }): JSX.Element;

export function SummaryBar(props: {
	count: string;
	tone?: 'default' | 'secondary';   // populated vs in-flight
	controls?: ReactNode;              // Show/Sort cluster, or the `N found` yield
	progress?: number | null;          // 0–1; renders the 2px bar on the band's bottom edge
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

Two straight code-vs-canvas defects are fixed in passing: both `Dropdown` and `Button` hardcode
`--radius-medium`, where design.md binds `Radius/radius-small` to *"Control Bar selects and the Scan
button"*; and `Button`'s `secondary` variant is transparent-with-border, where the Stop button is a
`bg/secondary` **fill** with a `text/default` label.

`ProgressBar` is unchanged — 2px, `--ls-bg-brand` on `--ls-bg-secondary`, full width, already
matching the canvas.

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
	total: number;
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

> **Amended 2026-09-05 — see §1.1.2's note.** The two fixed-box rows below are wrong on both the
> reference and the axis. `exceeds-fixed-box` and `truncated-fixed-box` are **`measuredHeight −
> node.height`**, from the single wrapped read, with **no second read**; the width axis cannot be
> exceeded because it is what forces the wrap. The reference is the node's LOCAL height, never
> `ownBounds`, which is the axis-aligned box and understates a rotated node's overshoot. Every
> growing-mode row below is unchanged and correct.

Let `own` be the node's own bounds, `container` the immediate parent's bounds, `available` the
offset-aware container height already computed by `measure.ts`.

| `reason` | Reference | `overflowPx` | Second read? |
|---|---|---|---|
| `exceeds-fixed-box` | `own` | `max(w − own.w, h − own.h)` | **yes** |
| `truncated-fixed-box` | `own` | `max(w − own.w, h − own.h)` | **yes** |
| `exceeds-container-height` | `available` | `measuredHeight − available` | no |
| `parent-escape` | `container` | `max(w − container.w, h − container.h)` | no |
| `maxLines-cap` | capped height | `freeHeight − cappedHeight` | no |
| `maxHeight-cap` | — | **field omitted** | no |
| `no-container`, `fits` | — | field omitted | no |
| every `unmeasurable` reason | — | field omitted | no |

Values are floats, unrounded on the wire. The panel ceils at render: a 0.4px overshoot rounding to
`overflows 0px` would restate the very problem the delta exists to make visible, and `1px` is at
least true. Sorting uses the raw value.

**`maxHeight-cap` omits the field because the magnitude is not knowable.** The clone inherits the
cap; clearing it with `maxHeight = null` is silently rejected outside auto-layout — LS-7 run 3
measured exactly `200.0 × 50.0` after the clear and a forced re-layout — so free growth is pinned at
the cap and the hidden height cannot be reached. `max(0, free − maxHeight)` yields 0, and rendering
`clips 0px` asserts a measurement we do not have. The verdict is still sound: it rests on the
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
table — the weakest possible first run for a tool whose entire pitch is catching what shallow tools
miss. German is 1.15, the canonical expansion case, and the brief's own content angle.

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

*Populated / all-nodes:* count `24 of 32` — `shown of scanned` — at `text/default`, weight strong.
Right-aligned Show and Sort, `stroke: false`, `prefixLabel: true`, sized to their own labels
(80–114px), 8px gap.

*Scanning:* count `Scanning… 1,284 of 3,410 nodes` at `text/secondary`; Show and Sort **removed**,
replaced by a right-aligned `6 found` yield derived from accumulated verdicts; `progress` set to
`completed / total`, rendering the 2px bar on the band's bottom edge.

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

`ResultsRow` is used unmodified. `tone` is the verdict itself — the row is keyed on
`OverflowVerdictValue`, which already carries four values, so no widening and no projection layer is
needed. `monoMeta` stays false; it is LS-9's.

```
meta = `${containerLabel}  •  ${word}${amount}`
```

`word` is the canvas vocabulary — `fits` · `clips` · `overflows` · `un-measurable` — with a double
space either side of the bullet. `amount` is `` ` ${Math.ceil(overflowPx)}px` `` when the field is
present and the empty string otherwise.

**The row label and the wire value differ, and that is settled, not drift.** The component set's
variant property reads `Severity=Truncates`, matching `OverflowVerdictValue`; the text inside that
variant reads `clips 8px`. The variant name is implementer-facing and must match the union; the copy
is better English. `primary` is the source string.

Clicking a row selects it (`bg/selected`). The jump affordance sends `select-node`; a `node-gone`
error surfaces as `operation-failed`.

### 2.7 States

| Condition | Surface |
|---|---|
| before any scan | `StateView state="first-run"` |
| selection scope, empty selection | `no-selection` |
| scope held no eligible text nodes | `no-text-on-page` |
| scan completed, some fonts unloadable | `fonts-unavailable` |
| node count over the advisory threshold, pre-scan | `large-file` |
| `mutation-failed` / `internal` / `node-gone` | `operation-failed`, with its `Try Again` action |
| stop produced **zero** rows | `scan-stopped` |
| stop produced rows | rows retained; the stop is reported in the summary bar |
| scan completed, filter yields nothing | `no-issues` |

`ShellState` gains `'no-issues'`. `No issues found / All 32 nodes fit their containers` is a designed
surface — its own canvas shell — but it is not one of the seven values in the merged enum. It cannot
reuse `no-text-on-page`: one says thirty-two nodes were checked and passed, the other says there was
nothing to check, and collapsing them undoes the distinction the green `fits` strip exists to make.

**A stop with results is not an empty state.** The user pressed Stop; they did not discard work. The
progress bar is removed, the selects unlock, the button reverts to Scan, and the rows stay.

The threshold behind `large-file` is **advisory at 500 and never blocks a scan** — provisional, to be
replaced by the LS-15 time-budget benchmark. The in-flight state already handles unbounded files
through determinate progress, a live count, streaming rows and Stop.

The footer is hidden in every `StateView` state and throughout scanning, and shown only in the
panel's working states.

### 2.8 Scan lifecycle

1. Scan pressed → `scan-started`; selects disable; Scan becomes Stop; Show and Sort leave the
   summary bar; the footer hides; `request('overflow-scan-request', { scope, targetLanguages: [language] })`.
2. Each 25-node tick → `progress` updates the count and bar; `overflow-scan-partial` appends its
   chunk and rows appear beneath the bands.
3. Stop pressed → `send('overflow-scan-cancel')` under the same correlation id. The panel does not
   change phase on send; it waits for the result.
4. Resolution → `overflow-scan-result` replaces the accumulated array with the complete set and
   sets the phase from `stopped`.
5. `error` at any point → `failed`, with the code mapped per §2.7.

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
- `sortVerdicts` — each of the four modes; `amount` places a `maxHeight-cap` row above every
  `fits` row and below every row carrying a delta; every mode breaks ties on document order; the
  input array is not mutated.

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

### 3.2 In-Figma — `npm run dev`, then *Run LS-8 overflow check*

`src/ui/overflow-check.ts` gains **pass 3 — magnitude**, run against
`fixtures/overflow-spike.fig`:

- Every row whose verdict is `overflows` or `truncates` carries `overflowPx`, **except**
  `maxHeight-cap` rows, which must not.
- No row whose verdict is `fits` or `unmeasurable` carries the field.
- Every present `overflowPx` is `> 0`.
- For each `NONE` / `TRUNCATE` row the check independently re-derives
  `max(w − own.w, h − own.h)` from a constrained-width read and asserts equality — the second read
  is verified against itself, not against a hand-typed constant.
- `hug-page-parent` remains `fits` with reason `no-container` and no `overflowPx`, confirming
  LS-7's immediate-parent rule survives the amendment.
- The observed delta per fixture row is printed and **recorded in the PR description** as the
  first-run baseline.

Pass 1 and pass 2 must remain green unchanged.

### 3.3 Bridge regression

The `progress`-settles-`request()` defect cannot be caught by Vitest — `src/ui/bridge.ts` touches
`window` at module scope and agent-guidelines §6 rules out jsdom. It is covered by:
- a `bridge.type-check.ts` addition asserting the pending entry's expected-response typing; and
- an in-Figma assertion that a scan of **more than 25 nodes** resolves with a populated `verdicts`
  array. Run it against `fixtures/large-file.fig`, not `overflow-spike.fig` — the spike fixture has
  14 rows and cannot reach the first progress tick, which is precisely why the defect went
  unnoticed.

### 3.4 Manual panel review against canvas

Checked against `🧩 Plugin — Phase 1`: populated shell, All Nodes shell (`258:393`), empty state,
Scanning shell (`266:839`), `Results Row` set (`184:96`), control bar (`253:308`), summary bar
(`185:57`).

- [ ] Bands stay fixed; only rows scroll.
- [ ] Scan/Stop occupy one slot; selects lock and unlock.
- [ ] Rows appear during the scan; the yield count climbs; the bar is determinate.
- [ ] A stop keeps its rows.
- [ ] Show and Sort are borderless; the control-bar selects are bordered at `radius-small`.
- [ ] The footer is absent in every empty state and during scanning.
- [ ] Selecting Japanese is not possible; its reason is legible.

**Run:** `npm test`, then `npx tsc -b`, then `npx eslint .`, then `npm run dev` for §3.2–3.4.

---

## §4 API pins

Per [`../agent-guidelines.md`](../agent-guidelines.md) §2. Nothing is repeated here. The surfaces
this spec leans on are `figma.ui.onmessage` delivery during an awaiting loop, the `maxHeight`
write-rejection outside auto-layout, and `textAutoResize`'s four values including `TRUNCATE` as a
live value.

---

## §5 Carry-forward register

| # | Item | Lands in |
|---|---|---|
| 1 | Native `<select>` prefixes the open option list as well as the trigger; the trigger is correct and the list reads `Show: issues · Show: all`. A custom popover was rejected in LS-5 §3.2 because `bg/menu/default` has no live binding. | LS-14 or a later kit pass |
| 2 | `maxHeight-cap` rows carry a verdict but no magnitude. If Figma ever permits clearing the cap off auto-layout, the row gains a delta with no contract change. | LS-15 / future API |
| 3 | `docs/design.md`'s "Resolved" entry claims hug nodes parent-walk to a constrained ancestor and that hug-with-no-constrained-ancestor is un-measurable. LS-7 §2 resolved immediate-parent-only with `no-container → fits`, and the shipped `measure.ts` and the `hug-page-parent` fixture row both implement that. The design.md entry is stale and needs a correction note. | doc fix, no code |
| 4 | `docs/specs/LS-8.md` → `docs/specs/LS-8.1.md`; the Linear issue's spec pointer follows. | Linear precision fix |
| 5 | The advisory 500-node threshold is provisional and circular-free only by accident; the real bound is a time budget. | LS-15 |
| 6 | agent-guidelines §1 folder map gains `src/ui/overflow/ LS-8` and `src/common/overflow.ts`. | doc fix |
| 7 | LS-5 §1.5 records `bands.tsx` with three exports; the file shipped with none. The header stays deleted; the note should record that the other two were collateral. | LS-5 precision fix |

Carry-forwards 1 and 7 from `LS-8.1.md` §5 are **closed by this spec**. Carry-forward 1's
`--overflow` reference was stale on arrival — superseded by the UI3 ramp, which `ResultsRow`
already implements as `--ls-icon-success` / `--ls-icon-warning` / `--ls-icon-danger` /
`--ls-icon-tertiary`. The remaining LS-8.1 carry-forwards stay where they are.

## §6 Precision fixes proposed to LS-8

1. **Spec pointer.** The issue names `docs/specs/LS-8.md`. It becomes the `LS-8.1` / `LS-8.2` pair.
2. **The px criterion.** *"Every flagged row states the overflow amount in px"* is not met by merged
   code and is not derivable from the merged `OverflowVerdict`. §1.1 is what makes it true; the
   criterion should note that it covers `overflows` and `truncates` and that `maxHeight-cap` is a
   named exception, so the criterion is testable rather than aspirationally universal.

**Not proposed:** clearing the `blockedBy` relations to LS-5, LS-7, LS-17 and LS-19. A relation
pointing at a Done issue is satisfied, not stale, and removing it erases the dependency record.
