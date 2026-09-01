# LS-8 — Basic overflow detection (HERO)

**Epic:** Features · **Blocked by:** LS-7 (Done — `docs/specs/LS-7.md`), FIX-1 (satisfied:
`fixtures/overflow-spike.fig`) · **Consumed by:** LS-14, LS-15, and the deferred panel spec.

**Scope split (decided at spec time).** This spec covers the **main-thread measurement engine and
its message wiring only** — the new `src/main/overflow/` folder. The results panel is deferred to a
follow-up spec written after LS-5 (shell) and LS-19 (DES-1) land. Reason: both are unstarted, so a
panel spec here would have to invent the shell's component API and the DES-1 state matrix — the
local-fork failure agent-guidelines §4 exists to prevent. The engine is fully acceptable on its own
against a dev-only in-Figma check, the pattern LS-3 and LS-4 already ship.

The measurement approach is **not decided here**. It is LS-7's output: Approach A, the off-canvas
temp-node clone. This spec productionises the LS-7 §2 protocol and the three live findings LS-7 §6
recorded as "LS-8 should adopt".

---

## 1. Contracts

### Produces — `src/common/models.ts` (expanded in place, never forked)

The `OverflowVerdict` stub carries a banner naming LS-8 as its owner and the five-value union as
provisional. LS-8 tightens and expands it there; it does not declare a second type.

```ts
export type OverflowVerdictValue = 'fits' | 'overflows' | 'truncates' | 'unmeasurable';

export type OverflowReason =
	| 'missing-font' | 'mixed-font-missing' | 'empty' | 'no-bounds'   // unmeasurable paths
	| 'unsupported-language'                                          // CJK — see §2
	| 'exceeds-fixed-box' | 'truncated-fixed-box'                     // NONE / TRUNCATE
	| 'maxLines-cap' | 'maxHeight-cap'                                // growing-mode caps
	| 'exceeds-container-height' | 'parent-escape' | 'no-container';  // container checks

export interface OverflowVerdict {
	nodeId: string;
	language: string;
	verdict: OverflowVerdictValue;
	severity?: 'warn' | 'error';
	reason?: OverflowReason;
	characters: string;      // source string, for the results row
	containerLabel: string;  // display path, for the results row
	candidate: string;       // the string actually measured
	measuredWidth: number;
	measuredHeight: number;
}
```

`'clips'` is dropped from the union per LS-7 §1: in Phase 1 there is no user-actionable distinction
between "clips" and "overflows". The three display fields (`characters`, `containerLabel`,
`candidate`) make `overflow-scan-result` self-sufficient — the panel renders a full row without
holding a prior `scan-result` or issuing a second round-trip.

### Produces — `src/common/messages.ts` (union 14 → 15)

```ts
export interface SelectNode extends Envelope<'select-node'> {
	nodeId: string;
}
```

- Added to the `UiToMain` union and to `UI_TO_MAIN_TYPES`.
- **Command, not request** — no `RequestResponse` entry. Failure is reported on `error`, correlated
  by `id`.
- `ErrorCode` gains `'node-gone'` (node deleted, or not reachable on the current page).
- `messages.fixtures.ts` gains a `select-node` fixture, and its existing `overflow-scan-result`
  fixture is updated for the new required `OverflowVerdict` fields.
- `messages.test.ts` `ALL_TYPES` goes to 15. That array is deliberately independent of
  `messages.ts`, so both edits are required — that is the drift guard working, not a duplication.

`select-node` is shared surface, not LS-8-private: LS-9's extraction list needs the identical
message. It is added here because LS-8 is the first consumer and the main-side handler is LS-8's.

### Produces — `src/main/overflow/expand.ts` (pure — no `figma`, Vitest-tested)

```ts
import type { PseudoLocOptions } from '../../common/models'; // owned by LS-10; referenced, not redefined

/** Growth fraction by source length band (IBM/W3C model — see §2). */
export const LENGTH_BANDS: readonly { maxChars: number; growth: number }[];

/** Per-language multiplier applied to band growth. 1.0 = European average. */
export const LANGUAGE_FACTORS: Readonly<Record<string, number>>;
export const DEFAULT_LANGUAGE_FACTOR: number;

/** Languages Phase 1 cannot synthesise a candidate for (CJK — see §2). */
export const UNSUPPORTED_LANGUAGES: ReadonlySet<string>;

/** ratio = 1 + bandGrowth(source.length) × languageFactor(language). Pure, deterministic. */
export function expansionRatio(sourceLength: number, language: string): number;

/** Deterministic pseudo-loc transform. Shared surface: LS-10 drives it with user-chosen options. */
export function transform(source: string, options: PseudoLocOptions): string;

/** Overflow-path wrapper: banded ratio, accent and brackets off.
 *  Throws nothing — callers must check UNSUPPORTED_LANGUAGES first. */
export function expandForLanguage(source: string, language: string): string;
```

This is the single pseudo-loc implementation in the codebase. LS-10 imports `transform` rather than
writing a second one; if LS-10 needs further options, it expands `PseudoLocOptions` and `transform`
in place (agent-guidelines §4).

### Produces — `src/main/overflow/verdict.ts` (pure — Vitest-tested)

```ts
export function severityFor(verdict: OverflowVerdictValue): 'warn' | 'error' | undefined;
```

### Produces — `src/main/overflow/measure.ts` (main thread)

```ts
import type { TextNodeModel } from '../traversal/model';

export interface MeasurementInput {
	node: TextNode;
	model: TextNodeModel;
	candidates: readonly string[];   // ONE clone, N candidates
}

export interface Measurement {
	candidate: string;
	verdict: OverflowVerdictValue;
	reason?: OverflowReason;
	measuredWidth: number;
	measuredHeight: number;
}

/** Off-canvas clone, per-mode rule, `clone.remove()` in `finally`. Never mutates a user node.
 *  Returns one Measurement per candidate, input order preserved. */
export async function measureOverflow(input: MeasurementInput): Promise<Measurement[]>;
```

### Produces — `src/main/overflow/index.ts`

```ts
export async function scanOverflow(
	scope: ScanScope,
	targetLanguages: readonly string[],
): Promise<OverflowVerdict[]>;

/** Wires `overflow-scan-request` and `select-node`. Called once from main.ts. */
export function registerOverflow(): void;
```

### Consumes (reference, never redefine)

| Type / rule | Owner |
|---|---|
| `TextNodeModel`, `traverse`, `NoSelectionError` | `src/main/traversal` (LS-3) |
| `PseudoLocOptions`, `OverflowVerdict`, `ScanScope`, `ErrorCode`, `Envelope` | `src/common` (LS-2) |
| Per-mode overflow rules, hug = parent-escape, clone protocol | `docs/specs/LS-7.md` §2 |
| `containerAvailableHeight`, binding-agnostic `maxHeight`, `no-bounds` path | `docs/specs/LS-7.md` §6 |
| Figma API surfaces | `docs/agent-guidelines.md` §2 |

**Not consumed: `src/main/snapshot` (LS-4).** Measurement never touches the snapshot primitive —
that decision is load-bearing (LS-7 §2, LS-4 design model item 1) and is why Approach B was
rejected. An `import` from `../snapshot` in this folder is a spec violation, not an optimisation.

---

## 2. Resolved Defaults (use exactly these — do not choose)

### Per-mode rules

Consume `docs/specs/LS-7.md` §2 as written. Three deltas from the live run (LS-7 §6) are normative
here because §2's prose predates them:

1. **`containerAvailableHeight` is offset-aware.** For `HEIGHT` mode, the room left is
   node-top → container-bottom: `container.y + container.height − ownBounds.y`. Not the container's
   raw height — the node's top edge is fixed and growth is downward.
2. **`maxHeight` detection is binding-agnostic.** `max(capped, free) >= maxHeight − EPS` ⇒
   `truncates`. Never rely on observing uncapped growth: clearing `maxHeight` off auto-layout is
   silently rejected, so a "free" read may still be capped.
3. **`ownBounds === null` is a fifth unmeasurable path** (`'no-bounds'`), absent from §2's table.

`EPS = 0.01`, matching Figma's dimension floor (agent-guidelines §2).

### Expansion model — length-banded, not a flat per-language ratio

**Expansion is a function of source length first and language second.** IBM's and W3C's
long-standing guidance is that the shorter the source string, the larger the factor to reserve —
strings under ~10 characters budget 100–200% growth, 11–20 characters ~80–100%, tapering to ~30%
past 70 characters. A Figma plugin scanning UI text measures buttons, labels, tabs and table
headers, which sit overwhelmingly in the short bands. A flat per-language constant is the wrong
model for exactly the node type this feature exists to protect: at a flat 1.35, `Save` → `Speichern`
(+150% in German) clears as "fits."

```
ratio = 1 + bandGrowth(source.length) × languageFactor(language)
```

**Length bands** (`LENGTH_BANDS`, growth = fraction added). Values are the **midpoint** of each
published range:

| Source length (chars) | Growth | Ratio at factor 1.0 |
|---|---|---|
| 1–10 | 1.50 | 2.50 |
| 11–20 | 0.90 | 1.90 |
| 21–30 | 0.70 | 1.70 |
| 31–50 | 0.50 | 1.50 |
| 51–70 | 0.35 | 1.35 |
| 71+ | 0.30 | 1.30 |

**Language factors** (`LANGUAGE_FACTORS`), multipliers on band growth; 1.0 = European average:

| Language | Factor | | Language | Factor |
|---|---|---|---|---|
| `fi` | 1.20 | | `pt` | 0.95 |
| `de` | 1.15 | | `fr` | 0.95 |
| `nl` | 1.10 | | `it` | 0.90 |
| `pl` | 1.05 | | `he` | 0.85 |
| `ru` | 1.05 | | `tr` | 0.85 |
| `es` | 1.00 | | `ar` | 0.85 |

Unknown language → `DEFAULT_LANGUAGE_FACTOR` = **1.00**.

Sanity check against the published anchors: a 4-character source in German gives
`1 + 1.50 × 1.15 = 2.73` → 11 characters, against the real `Speichern` at 9 — conservative by two
characters. An 80-character source in German gives `1 + 0.30 × 1.15 = 1.35`, matching the
widely-cited 30–40% prose figure. The model reproduces both ends, which the flat table did not.

**Midpoint, not upper bound.** The upper bound (2.0 growth in band 1) would flag nearly every button
in a typical file. Alarm fatigue makes the tool ignored, which fails the same way a missed break
does. The midpoint is the documented knob if field evidence moves it.

### CJK is not offered in Phase 1

`UNSUPPORTED_LANGUAGES` = `{ 'ja', 'ko', 'zh', 'zh-Hans', 'zh-Hant', 'th' }`. A request naming one
returns every node as `unmeasurable` / `'unsupported-language'`.

The naive treatment — CJK contracts, so clamp the ratio at 1.0 and call it safe — is **wrong on
rendered width**, which is the only thing that matters here. Because of glyph width, each Chinese
and Korean character counts as two English characters in width, so a translation at half the
character count occupies the same space. A character-count floor would report "cannot overflow" for
strings that are exactly as wide.

Measuring it properly means padding with real CJK glyphs so Figma renders true advance widths — but
the node's font may carry no CJK coverage, and the fallback glyph's width is not the real font's
width. That is a font-coverage problem, not an arithmetic one, and it is out of scope here. Honest
refusal beats a confident wrong verdict.

### Expansion algorithm — banded padding

Deterministic; no randomness anywhere. Pad the source to `ceil(source.length × ratio)`:

- **Source ≤ 20 characters** (bands 1–2, the UI-label case): pad as a **single unbroken token**, no
  spaces inserted. This is the compound-noun case, and it is the dominant one. A 30-character German
  compound is one token that cannot wrap at spaces because it contains none, and a layout that
  survives long French phrases will still shatter against German and Finnish. Padding a button label
  with spaces fakes a wrap the real translation will not have, and under-reports auto-height
  overflow precisely where breakage is worst.
- **Source > 20 characters** (phrases and sentences): pad by **cycling the source's own words**,
  space-separated, so wrap behaviour and character distribution track the real string.
- A source containing no spaces always pads as one token regardless of band.
- Empty source returns empty.

On the overflow path, **accent and brackets are off**: diacritics add visual noise, not advance
width, and bracketing would inflate the measurement by a constant that no translation carries.
`transform` still honours both for LS-10's on-canvas use.

### Verdict → severity

| Verdict | Severity |
|---|---|
| `overflows` | `error` |
| `truncates` | `warn` |
| `unmeasurable` | `warn` |
| `fits` | field absent |

Truncation is intentional-but-worth-checking; silent overflow is the break the plugin exists to
catch.

### Node eligibility

| Node state | Treatment |
|---|---|
| `hidden === true` | **Excluded from results entirely** — an invisible node cannot break a layout |
| `locked === true` | Measured and reported normally |
| `inInstance === true` | Measured and reported normally |
| `empty === true` | Reported as `unmeasurable` / `'empty'` |

Locked and instance nodes are safe because measurement is read-only: it clones. Neither flag gates
anything here — they gate LS-4's mutation path, not this one.

### Unmeasurable is not "blocked"

Unmeasurable nodes ride the verdict array with `verdict: 'unmeasurable'` and a `reason`. They are
**never** reported on the `nodes-blocked` error channel. Nothing is blocked from mutation because
nothing mutates; that channel stays LS-4's. This is what satisfies the issue's "never silently
passed as fits" criterion — the node appears in the results with an explicit reason.

### Clone lifecycle

One clone per node, reused across every candidate:

1. `const clone = node.clone()`.
2. `figma.currentPage.appendChild(clone)` — parent to the page **explicitly**, so an auto-layout
   parent can never constrain it.
3. `clone.x = -10000; clone.y = -10000`.
4. Re-check `clone.hasMissingFont` on the live clone before any write — a font may have gone missing
   since the scan, and a missing-font node must never be mutated, not even moved.
5. Load every font once via `clone.getRangeAllFontNames(0, clone.characters.length)`.
6. Measure each candidate in order.
7. `clone.remove()` in `finally` — always, including on throw.

At N nodes × M languages this is N clones and N font-load passes, not N×M. Phase 1 sends M = 1, so
the win is latent; the shape is free now and a retrofit later.

### Multi-language

`targetLanguages` is iterated. Output is one `OverflowVerdict` per node × language. Phase 1 sends a
one-element array. **No cap is implemented anywhere** — not per-pass, not per-language
(agent-guidelines §3 carve-out; brief §6 simultaneity-not-coverage).

### Progress

`progress` emitted every 25 nodes. `total` = eligible node count **after** the hidden filter, so the
bar cannot stall short of its own maximum.

### Errors

| Condition | Wire result |
|---|---|
| Selection-scoped scan, nothing selected | `error` / `no-selection` |
| Scope contained zero text nodes | **Empty verdict array, not an error** (matches LS-3) |
| Anything thrown | `error` / `internal` |
| `select-node` on a deleted or unreachable node | `error` / `node-gone` |

### `select-node` handler

`await figma.getNodeByIdAsync(nodeId)` → if `null` or not a `TextNode`, emit `node-gone`. Otherwise
`figma.currentPage.selection = [node]` then `figma.viewport.scrollAndZoomIntoView([node])`, wrapped
in try/catch → `node-gone` (a node on another page throws under dynamic-page).

### Throwaway harness deletion

`src/main/devtools/overflowSpike.ts` is **deleted** when this lands, and its `__dev:run-overflow-spike`
sentinel removed from `main.ts`. It is throwaway by construction (LS-7 §3); leaving it behind means
two divergent measurement implementations, which is exactly the drift the spike warned about.
`generateOverflowSpike.ts` stays — it builds the fixture.

---

## 3. Concrete Acceptance

**Fixture:** `fixtures/overflow-spike.fig`, promoted to the LS-8 acceptance fixture at LS-7 close.
No `known-overflow.fig` is planned. `fixtures/overflow-spike.md` is updated in the same pass with
the authored source strings that pass 2 depends on.

**Harness:** `src/main/overflow/check.ts`, registered under `import.meta.env.DEV` from `main.ts`,
following the `traversal/check.ts` and `snapshot/check.ts` pattern. Logs one `PASS`/`FAIL` line per
row plus a summary.

### Pass 1 — per-mode rules, explicit candidates

The rule check passes candidate strings directly, bypassing expansion, so a wrong ratio cannot
masquerade as a wrong rule. `SHORT = 'OK'`; `LONG` = the 160-character sentence carried over from
the spike harness.

| Node label | Candidate | Expected verdict | Expected reason |
|---|---|---|---|
| `fixed-fits` | `SHORT` | `fits` | — |
| `fixed-overflows` | `LONG` | `overflows` | `exceeds-fixed-box` |
| `truncate-fits` | `SHORT` | `fits` | — |
| `truncate-overflows` | `LONG` | `truncates` | `truncated-fixed-box` |
| `autoheight-fits` | `SHORT` | `fits` | — |
| `autoheight-overflows` | `LONG` | `overflows` | `exceeds-container-height` |
| `autoheight-maxlines` | `LONG` | `truncates` | `maxLines-cap` |
| `autoheight-maxheight` | `LONG` | `truncates` | `maxHeight-cap` |
| `hug-fits` | `SHORT` | `fits` | — |
| `hug-overflows` | `LONG` | `overflows` | `parent-escape` |
| `hug-page-parent` | `LONG` | `fits` | `no-container` |
| `missing-font` | `SHORT` | `unmeasurable` | `missing-font` |
| `mixed-font-ok` | `SHORT` | any verdict ≠ `unmeasurable` | — |
| `rotated-fixed` | `LONG` | `overflows` | `exceeds-fixed-box` |

### Pass 2 — end-to-end through `scanOverflow`

Rows re-measured through the real path — `scanOverflow('page', ['de'])` — using each node's
**authored** characters, exercising the banded model, the message wiring, and the verdict projection
together. Authored strings to set in the fixture:

| Node label | Authored characters | Len | Ratio at `de` | Expected |
|---|---|---|---|---|
| `fixed-fits` | `Your changes have been saved automatically.` | 43 | 1.58 | `fits` — box has room for the expanded string |
| `fixed-overflows` | `Save` | 4 | 2.73 | `overflows` — 11 chars in a box cut to the English word |
| `autoheight-maxlines` | `Continue to checkout` | 20 | 1.90 | `truncates` / `maxLines-cap` |

`fixed-overflows` is now the short-string case, and it is the demo the launch narrative rests on: a
four-letter English button that breaks in German. **Under the old flat 1.35 this row returned
`fits`** — it is the regression test for the model defect, and it must stay in the short band.

Pass 2 additionally asserts the refusal path: `scanOverflow('page', ['ja'])` returns every eligible
node as `unmeasurable` / `'unsupported-language'`, and no clone is created.

### Pass 3 — `select-node`

Send `select-node` for the first `overflows` row; assert `figma.currentPage.selection` holds exactly
that node. Send `select-node` with a fabricated id; assert an `error` with code `node-gone` and no
throw.

### Vitest (pure, no `figma`)

| File | Covers |
|---|---|
| `expand.test.ts` | band boundaries exact at 10/20/30/50/70 chars; `expansionRatio(4, 'de') === 2.73`; `expansionRatio(80, 'de') === 1.35`; unknown language → factor 1.0; every `UNSUPPORTED_LANGUAGES` member is refused before any measurement; target length is `ceil(len × ratio)`; sources ≤ 20 chars pad as one token with **zero** spaces added; sources > 20 chars pad by word cycling; a space-free long source stays one token; empty source → empty; same input twice → identical output |
| `verdict.test.ts` | `severityFor` exhaustive over all four verdict values, including `fits` → `undefined` |
| `messages.test.ts` | updated `ALL_TYPES` (15) and the two fixture edits |

### Run

```
npx tsc -b && npx eslint . && npm test
npm run dev   # → open fixtures/overflow-spike.fig → dev-only overflow check
```

### Done when

- [ ] Pass 1: 14/14, verdict **and** reason matching the table.
- [ ] Pass 2: 3/3 through `scanOverflow` with `targetLanguages: ['de']`.
- [ ] Pass 3: selection lands on the right node; the fabricated id yields `node-gone`.
- [ ] `npm test` green, including the three Vitest files above.
- [ ] `overflowSpike.ts` deleted and its sentinel removed from `main.ts`.
- [ ] `fixtures/overflow-spike.md` updated with the pass-2 authored strings.

---

## 4. API pins

All Figma API facts this spec relies on are pinned in **`docs/agent-guidelines.md` §2** —
`textAutoResize` (four values, `TRUNCATE` live on read), `textTruncation`, `maxLines` (silent
write-reject on fixed-size nodes), `maxHeight` (binds off auto-layout; clearing silently rejected),
`clone()`, `absoluteBoundingBox`, `hasMissingFont`, `loadFontAsync`, `figma.mixed`,
`getNodeByIdAsync` under dynamic-page, `figma.currentPage.loadAsync()` before traversal, the 0.01 px
dimension floor, and the postMessage transport rules. Referenced, not repeated.

For any surface not pinned there, consult <https://developers.figma.com/docs/plugins/> — never
invent API shape from memory. If live behaviour contradicts a pin, record it and flag it for
folding into §2, as LS-7 did.

---

## 5. Carry-forwards (open by design, not blockers)

| # | Decision deferred | Inherits it |
|---|---|---|
| 1 | Results panel, `select-node` UI consumer, severity treatment via the UI3 severity ramp (`icon/success` fits · `icon/warning` clips · `icon/danger` overflows · `icon/tertiary` un-measurable — agent-guidelines §7), empty/error/loading states | **LS-8 panel spec** (after LS-5 + LS-19); LS-14 hardens the states |
| 2 | `transform()` is the one pseudo-loc implementation. LS-10 imports it; further options expand `PseudoLocOptions` and `transform` **in place**, never fork | **LS-10** |
| 3 | Real-translation candidates. When a preview map exists, `overflow-scan-request` gains an optional translation source; expansion stays the default | **LS-12** |
| 4 | Clone-fidelity gap on auto-layout-heavy files — mitigation is reparenting the clone into the original's parent (LS-7 §5). Plus clone and font-load throughput at scan volume; the one-clone-per-node shape is already in place | **LS-15** |
| 5 | `OverflowReason` ships machine tokens only. No user-facing copy exists in this issue | **LS-14** |
| 6 | `select-node` is shared surface — the extraction list consumes the same message, no new type | **LS-9** |
| 7 | Hidden nodes are excluded, so a node unhidden after a scan ships an unflagged break. Mitigation if it bites: an "include hidden" scan option | **LS-8 panel spec / LS-14** |
| 8 | Sibling-collision overflow for hug nodes; hug-node character-limit derivation for the AI constraint; `parentClipsContent` refinement (visual clipping vs. layout break); reintroducing `'clips'` if the QA report needs the granularity | **Phase 2** |
| 9 | Band growths and language factors are calibration knobs, not measured values. The bands follow published IBM/W3C guidance; the per-language factors are still judgement. `expansionRatio` is the single edit point, and real translations are the first evidence that can move them | **LS-12 / Phase 2** |
| 10 | CJK and Thai are refused, not measured. Supporting them needs font-coverage detection (does this node's font render the script at all?) plus width-aware rather than character-count-aware padding. Refusal is honest but it is a hole in "detection across all target languages" | **Phase 2** |
| 11 | Repo hygiene, outside this issue: `agent-guidelines.md` lost its §3 heading (numbering jumps 2 → 4) and has no §Learning Mode section, which the project instructions cite as its source of truth. *(Resolved 2026-08-09: §3 "Message bridge (LS-2)" restored with the `targetLanguages` carve-out; numbering now runs 1–8. The §Learning Mode half is unsubstantiated — no file in the repo cites such a section, and `CLAUDE.md` / `AGENTS.md` reference agent-guidelines only for conventions, API pins, the contracts rule and the spec template.)* | **separate guidelines pass — done** |
