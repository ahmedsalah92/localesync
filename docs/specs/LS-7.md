# LS-7 — Overflow measurement strategy spike 🔬

**Epic:** Spike · **Blocked by:** LS-3, LS-4 · **Output:** decision document (this file, once
accepted) + the per-mode overflow rules and measurement signature LS-8 implements. **Not
production code** — LS-8 must not start before this closes (agent-guidelines §8).

---

## 1. Contracts

LS-7 is a spike. Its "contracts" are the types and per-mode rules it produces for LS-8, plus
the verdict vocabulary it tightens from the LS-2 provisional stub.

### Produces — per-mode overflow rules (spike output, consumed by LS-8)

```ts
// Spike output; LS-8 moves these to src/main/overflow/ when it implements.

type ResizeMode = 'NONE' | 'TRUNCATE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT';

interface OverflowRule {
  mode: ResizeMode;
  /** Which dimension(s) to check for overflow */
  axes: ('width' | 'height')[];
  /** The reference bounds to compare the measured content against */
  reference: 'own-bounds' | 'container-bounds';
  /** Whether maxLines/maxHeight caps apply as truncation triggers */
  truncationTriggers: ('maxLines' | 'maxHeight')[];
}
```

The four concrete rules (derived from the resolved defaults below):

| Mode | Axes | Reference | Truncation triggers | Verdict logic |
|---|---|---|---|---|
| `NONE` | `['width','height']` | `own-bounds` | `[]` | content exceeds fixed box → `overflows` |
| `TRUNCATE` | `['width','height']` | `own-bounds` | `[]` | same as `NONE`; truncation already active → `truncates` if content would exceed |
| `HEIGHT` | `['height']` | `container-bounds` | `['maxLines','maxHeight']` | width is fixed (wraps); height grows → exceeds container or hits maxLines/maxHeight cap → `overflows` or `truncates` |
| `WIDTH_AND_HEIGHT` | `['width','height']` | `container-bounds` | `['maxLines','maxHeight']` | both dimensions grow; exceeds immediate parent bounds → `overflows` (parent-escape) |

### Produces — measurement function signature (LS-8 implements)

```ts
import type { TextNodeModel } from '../traversal/model';

interface MeasurementInput {
  node: TextNode;           // live node ref (re-fetched via getNodeByIdAsync)
  model: TextNodeModel;     // LS-3 model (pre-scanned, provides bounds + flags)
  candidateText: string;    // the translated string to measure against
}

type MeasurementVerdict = 'fits' | 'overflows' | 'truncates' | 'unmeasurable';

interface MeasurementResult {
  nodeId: string;
  verdict: MeasurementVerdict;
  reason?: string;          // explanation when unmeasurable or truncates
  measuredWidth: number;    // content width with candidate text (from clone)
  measuredHeight: number;   // content height with candidate text (from clone)
}

/** Creates an off-canvas clone, sets candidate text, reads resulting bounds,
 *  compares against the per-mode overflow rule. Never mutates the user's node.
 *  Deletes the clone before returning. */
async function measureOverflow(input: MeasurementInput): Promise<MeasurementResult>;
```

### Produces — verdict vocabulary refinement

The LS-2 provisional `OverflowVerdict.verdict` union (`'fits' | 'clips' | 'overflows' |
'truncates' | 'unmeasurable'`) is tightened to **four values**:

`'fits' | 'overflows' | 'truncates' | 'unmeasurable'`

`'clips'` is dropped — in Phase 1 there is no user-actionable distinction between "clips" and
"overflows" (both mean "the translation doesn't fit"). The distinction can be reintroduced in
Phase 2 if the QA report needs finer granularity. LS-8 applies this change to
`src/common/models.ts` in place when it lands (agent-guidelines §4).

### Produces — paid-tier lead ordering (brief §6 fork)

**Report-led.** The exportable QA report leads the paid tier; length-constrained AI is the
second leg. Rationale: report value is measurement-independent (it replaces screenshot-and-Slack
triage regardless of measurement precision), making it the safer anchor. The AI leg depends on
measurement fidelity, which this spike validates but cannot fully guarantee at every edge case.

### Consumes (reference, never redefine)

- `TextNodeModel` — `src/main/traversal/model.ts` (LS-3). Specifically: `textAutoResize`,
  `textTruncation`, `maxLines`, `maxHeight`, `ownBounds`, `containerBounds`,
  `parentClipsContent`, `hasMissingFont`, `isMixedFont`, `fonts`, `empty`.
- `OverflowVerdict` — `src/common/models.ts` (LS-2 stub, tightened above).
- `OverflowScanRequest` / `OverflowScanResult` — `src/common/messages.ts` (LS-2).
- Figma Plugin API — agent-guidelines §2; consult the live docs for anything unpinned.

---

## 2. Resolved Defaults (use exactly these)

### Measurement approach: Approach A — off-canvas temp-node clone

**Approach B (mutate-and-restore) rejected.** Mutating the user's node at scan volume makes the
corruption-prone LS-4 primitive performance-critical. LS-4's design model (item 1) already
committed away from this: *"Measurement does not use this primitive."*

**Approach C (`fillGeometry`) rejected.** Unreliable for multi-line text. The community
consensus (Figma Forum, May 2024) is that `fillGeometry` paths for text are messy SVG requiring
statistical analysis to determine line breaks. No visual line-splitting API exists (feature
request filed July 2025, still open as of July 2026). The complexity-to-reliability ratio is
prohibitive.

**Approach A confirmed.** Clone the user's `TextNode` via `node.clone()`, move it off-canvas,
load fonts, set candidate text, read `absoluteBoundingBox`, delete the clone. This never touches
the user's node and eliminates the corruption-risk vector entirely.

### Clone measurement protocol (per mode)

For every measurement, the procedure is:

1. `const clone = node.clone()` — inherits all text properties (font, fontSize, lineHeight,
   letterSpacing, textCase, per-range styles, textAutoResize, textTruncation, maxLines,
   maxHeight).
2. `clone.x = -10000; clone.y = -10000` — off-canvas, invisible to the user.
3. Load fonts on the clone: if `clone.hasMissingFont` → skip, verdict `unmeasurable`. Else
   load all fonts via `clone.getRangeAllFontNames(0, clone.characters.length)` +
   `figma.loadFontAsync` for each.
4. Per-mode text and resize setup (see table below).
5. Read `clone.absoluteBoundingBox` → `{ width: measuredWidth, height: measuredHeight }`.
6. `clone.remove()` — always, including on error (wrap in try/finally).
7. Apply the per-mode overflow rule to produce the verdict.

| Mode | Clone setup before reading bounds | Overflow check |
|---|---|---|
| `NONE` | Set `clone.textAutoResize = 'WIDTH_AND_HEIGHT'` (unlock box so content determines size), then set `clone.characters = candidateText`. | `measuredWidth > ownBounds.width` OR `measuredHeight > ownBounds.height` → `overflows`. |
| `TRUNCATE` | Same as `NONE` (unlock to measure natural content size). | Same comparison as `NONE`. Verdict is `truncates` (not `overflows`) because the user has truncation enabled — the content *would* be ellipsized, not clipped silently. |
| `HEIGHT` | Keep `clone.textAutoResize = 'HEIGHT'` (width stays fixed, height grows). Set `clone.characters = candidateText`. If `maxLines` is set and `textTruncation === 'ENDING'`, keep them on the clone to observe their effect. | If `maxLines`/`maxHeight` would cap the height (detected by comparing free-growth height vs capped height — see §maxLines below): verdict `truncates`. Else if `measuredHeight > containerAvailableHeight`: verdict `overflows`. Else `fits`. |
| `WIDTH_AND_HEIGHT` | Keep `clone.textAutoResize = 'WIDTH_AND_HEIGHT'`. Set `clone.characters = candidateText`. | `measuredWidth > containerBounds.width` OR `measuredHeight > containerBounds.height` → `overflows` (parent-escape). If `containerBounds` is null (parent is page) → `fits`. |

### Hug-node overflow: parent-escape only

A `WIDTH_AND_HEIGHT` (hug) node's overflow is defined as: the node's measured bounds (with
candidate text) exceed the **immediate parent's** bounds. Sibling collision (does the grown node
overlap a neighbor?) is **explicitly out of scope** — it requires modelling the full auto-layout
engine (spacing, padding, grow/shrink, order) and cannot be reliably computed from the static
snapshot LS-3 provides.

**Carry-forward → Phase 2:** sibling-collision detection, if wanted, requires either the
mutate-and-restore approach (which this spike rejected) or a layout-engine model. Record as a
Phase-2 candidate, not a Phase-1 gap.

### Overflow container: immediate parent

Use LS-3's `model.containerBounds` (the immediate parent's `absoluteBoundingBox`). Do not walk
ancestors to find the nearest clipping frame. If `containerBounds` is null (parent is the page),
the node has no constraining container → verdict `fits`.

The `parentClipsContent` flag (captured by LS-3) is available for Phase 2 refinement (e.g.
distinguishing "parent clips → visual clipping" from "parent doesn't clip → content visible but
layout broken"). Phase 1 does not gate the verdict on it — any parent-escape is reported.

### `maxLines` / `maxHeight` truncation detection

**`maxLines` semantics (confirmed per agent-guidelines pin):** `maxLines` is settable only on
auto-height (`HEIGHT`) or hug (`WIDTH_AND_HEIGHT`) nodes. On fixed-size nodes (`NONE` /
`TRUNCATE`), Figma silently rejects the write and `maxLines` stays `null`. So `maxLines`
truncation is only a trigger for growing modes.

**Detection protocol for `HEIGHT` mode with `maxLines`:**

1. Clone with `textAutoResize = 'HEIGHT'`, `maxLines` and `textTruncation` preserved.
2. Set candidate text. Read `height₁` = clone's height (capped by maxLines).
3. Remove `maxLines` (set `clone.textTruncation = 'DISABLED'`, `clone.maxLines = null`).
4. Read `height₂` = clone's height (free growth).
5. If `height₂ > height₁` → `maxLines` truncation is active → verdict `truncates`.

Same principle for `maxHeight`: if the clone's free-growth height exceeds `maxHeight`, the cap
is active → verdict `truncates`.

**`maxLines` on `WIDTH_AND_HEIGHT` mode:** rare in practice (the node hugs in both dimensions).
`maxLines` can be set on hug nodes in auto-layout frames. Same detection protocol: compare
capped vs free height.

**Spike must confirm live:** the validation fixture includes nodes with `maxLines` and
`maxHeight` to verify this detection protocol works against real Figma.

### Missing-font / mixed-font handling

| Node state | Verdict | Reason |
|---|---|---|
| `hasMissingFont: true` | `unmeasurable` | `missing-font` |
| `isMixedFont: true`, no missing font | **measurable** | Clone preserves per-range font assignments. Load all fonts, set candidate text, measure. Per-range styling won't match the candidate text's character boundaries, but overall size is a useful approximation. |
| `isMixedFont: true`, any font missing | `unmeasurable` | `mixed-font-missing` |
| `empty: true` | `unmeasurable` | `empty` — nothing to measure |

### Rotated nodes

Rotated nodes (`rotation ≠ 0`) are measurable. `absoluteBoundingBox` returns the axis-aligned
bounding box of the rotated node. The clone inherits rotation. The overflow check compares
axis-aligned boxes, which is geometrically conservative (may report overflow slightly early for
rotated content). This is acceptable — a false positive on a rotated node is better than a false
negative.

### Clone fidelity gap (acknowledged, accepted)

The clone is parented to `figma.currentPage`, not inside the original node's parent. This means:

- **Auto-layout context is absent.** A clone of a text node inside an auto-layout frame does
  not receive the parent's constraints (fill/hug behavior, min/max width from auto-layout).
- **`layoutSizingHorizontal` / `layoutSizingVertical`** on the original node (e.g. `FILL`) are
  not inherited by the free-standing clone.

**Mitigation for `HEIGHT` mode:** the clone's width matches the original's width (since
`HEIGHT` preserves width). The auto-layout parent may have constrained that width, but the
clone inherits the *resulting* width, so the measurement is faithful.

**Mitigation for `WIDTH_AND_HEIGHT` mode:** the clone grows freely. The comparison is against
the parent's bounds, not the node's bounds, so the auto-layout context gap does not affect the
*reference* — only the *measured* size. Since a hug clone with no auto-layout constraints
grows at least as large as one inside auto-layout, this is geometrically conservative (may
report overflow when auto-layout would accommodate it). Acceptable for Phase 1.

**Carry-forward → LS-15:** if the clone fidelity gap produces unacceptable false positives on
auto-layout-heavy files, the mitigation is to temporarily reparent the clone into the
original's parent (preserving auto-layout context), measure, then remove. This is a Phase 1
performance-pass candidate, not a spike-blocking question.

---

## 3. Concrete Acceptance

### Validation fixture — `fixtures/overflow-spike.fig`

Human-built (agent-guidelines §6). One labelled text node per row, each inside a constraining
parent frame with known bounds. The fixture validates the per-mode overflow rules against real
Figma behavior.

| Node label | Setup | Candidate text | Expected verdict |
|---|---|---|---|
| `fixed-fits` | `NONE`, 200×40, parent 300×100 | Short text fitting in 200×40 | `fits` |
| `fixed-overflows` | `NONE`, 200×40, parent 300×100 | Long text exceeding 200×40 | `overflows` |
| `truncate-fits` | `TRUNCATE`, 200×40, truncation enabled | Short text | `fits` |
| `truncate-overflows` | `TRUNCATE`, 200×40, truncation enabled | Long text exceeding box | `truncates` |
| `autoheight-fits` | `HEIGHT`, width 200, parent 300×100 | Text fitting within parent height | `fits` |
| `autoheight-overflows` | `HEIGHT`, width 200, parent 300×100 | Text whose wrapped height exceeds parent | `overflows` |
| `autoheight-maxlines` | `HEIGHT`, width 200, `maxLines: 2`, `textTruncation: ENDING` | Text exceeding 2 lines | `truncates` |
| `autoheight-maxheight` | `HEIGHT`, width 200, auto-layout child, `maxHeight: 50` | Text whose natural height > 50 | `truncates` |
| `hug-fits` | `WIDTH_AND_HEIGHT`, parent 300×100 | Short text fitting in parent | `fits` |
| `hug-overflows` | `WIDTH_AND_HEIGHT`, parent 300×100 | Long text exceeding parent width | `overflows` |
| `hug-page-parent` | `WIDTH_AND_HEIGHT`, parent is page | Any text | `fits` (no container) |
| `missing-font` | Any mode, unavailable font | Any | `unmeasurable` |
| `mixed-font-ok` | Two fonts, both available | Any | measurable (verdict depends on text) |
| `rotated-fixed` | `NONE`, `rotation: 30`, 200×40 | Long text | `overflows` |

### Spike validation protocol

This is a **manual, dev-only** validation — not an automated test suite. The spike author:

1. Opens `fixtures/overflow-spike.fig` in Figma with the dev server running.
2. Runs a dev-only spike command (**Run LS-7 overflow spike**) that, for each labelled node:
   - Reads the `TextNodeModel` via LS-3's `traverse`.
   - Calls a prototype `measureOverflow` function with the candidate text (hard-coded per
     label in the spike harness).
   - Logs the verdict.
3. Compares logged verdicts against the expected column above.
4. Records pass/fail and any fidelity observations in the decision doc.

The spike harness is **throwaway code** — it lives in a dev-gated file, is never merged to
main, and is not the LS-8 implementation. Its purpose is to validate the per-mode rules against
real Figma before committing LS-8 to them.

### `maxLines` live verification

The spike must confirm, against the `autoheight-maxlines` fixture node:

- [x] Setting `maxLines: 2` on an auto-height clone caps the clone's height.
- [x] Removing `maxLines` (setting `textTruncation = 'DISABLED'`) on the same clone allows
      free height growth.
- [x] The height difference between capped and free confirms the detection protocol works.

This is the API-verification gap the brief §12 and the issue flag. Record the observed behavior
in the decision doc.

### Success criteria (from the issue, mapped to this spec)

- [x] Written recommendation: Approach A confirmed with fidelity notes and the report-vs-AI
      paid-lead call recorded (§1 above).
- [x] Correct overflow verdict demonstrated for each `textAutoResize` mode on the fixture —
      per the rules table in §2 (run 3: 14/14 — §6).
- [x] Hug-node overflow defined as parent-escape only; sibling-collision explicitly scoped out
      with carry-forward.
- [x] `maxLines` semantics confirmed against live Figma behavior; detection protocol validated.
- [x] Missing/mixed font handling rules validated (unmeasurable where expected, measurable
      where expected).

### Run

Dev-only: `npm run dev` → open `fixtures/overflow-spike.fig` → dev-only **Run LS-7 overflow
spike** button. No `npm test` component — this is a research spike, not a testable module.

---

## 4. API pins

Baseline pins — `textAutoResize` four values, `textTruncation`, `maxLines` (settable only on
auto-height/hug), `maxHeight` (auto-layout children only), `clone()`, `absoluteBoundingBox`,
`hasMissingFont`, `loadFontAsync`, `figma.mixed`, `getNodeByIdAsync` (dynamic-page),
`resizeWithoutConstraints` — live in **agent-guidelines §2**; referenced, not repeated.

No new API surfaces to pin. If the spike's live validation reveals undocumented behavior (e.g.
`clone()` not inheriting `maxLines`, or `absoluteBoundingBox` not updating synchronously after
setting `characters`), record the finding in the decision doc and flag it for folding into
agent-guidelines §2.

---

## 5. Carry-forwards (open by design, not blockers)

- **→ LS-8:** implements `measureOverflow` per the signature and per-mode rules above. Owns
  `src/main/overflow/`. Wires the `overflow-scan-request` / `overflow-scan-result` message pair
  (LS-2). Tightens the `OverflowVerdict` vocabulary in `src/common/models.ts` from five to four
  values.
- **→ LS-8 / FIX-1:** the `known-overflow.fig` fixture (the LS-8 acceptance fixture with
  hand-checked expected verdicts) is built *after* this spike closes, so its verdicts match the
  resolved per-mode rules. Deferred from FIX-1 pending this spike. *(Resolved 2026-07-25:
  `overflow-spike.fig` is promoted to this role — see `fixtures/overflow-spike.md`; extend it at
  LS-8 start rather than building a separate file.)*
- **→ LS-15:** clone fidelity gap on auto-layout-heavy files. If false positives are
  unacceptable, reparent the clone into the original's parent for measurement. Performance-pass
  candidate.
- **→ Phase 2:** sibling-collision overflow for hug nodes. Hug-node character-limit derivation
  for the AI constraint (brief §4 note: "the constraint passed to the AI for flexible nodes
  cannot be a source-string character count; it must be derived from parent/context bounds").
- **→ agent-guidelines §2:** any undocumented API behavior discovered during live validation
  (pin it upstream).

---

## 6. Spike run record (fill in after the live run — closes the spike)

Harness: dev-only **Generate overflow-spike** (builds 13/14 rows; `missing-font` is manual per
`fixtures/overflow-spike.md`) and **Run LS-7 overflow spike** (`src/main/devtools/overflowSpike.ts`
— throwaway per §3, not the LS-8 implementation). Run: `npm run dev` → open
`fixtures/overflow-spike.fig` → click the run button → copy the `[ls7]` console lines here.

**Run date:** 2026-07-25 · **Figma desktop version:** ________ · **Run by:** Ahmed Salah

Run 1: 13 PASS, 1 FAIL. The `autoheight-maxheight` FAIL was a **harness gap, not a rule gap** —
see the maxHeight finding below.

Run 2 (harness v2 — cleared `maxHeight` on the clone before the free read): `autoheight-maxheight`
still `fits`, measured 200.0×50.0 — clearing did **not** restore free growth. Open hypotheses,
instrumented by harness v3 (prints a `[ls7] harness v3` banner; no banner = stale main bundle):
either the `maxHeight = null` write is silently rejected off auto-layout (cf. the `maxLines`
silent-reject pin) or the write lands but doesn't re-derive the box (v3 forces a characters-rewrite
re-layout and logs `clone.maxHeight after clear=…`). Independent of the answer, v3 switches to a
**binding-agnostic verdict rule**: content height *reaching* the cap — pinned at exactly
`maxHeight` or grown past it — proves the cap is active ⇒ `truncates`; content genuinely shorter
never reaches it, so `fits` is unaffected. That rule is correct in every hypothesis, so the row's
verdict no longer depends on cap-clearing working.

Run 3 (harness v3): **14 PASS, 0 FAIL, 0 SKIP** — every §3 expected verdict demonstrated.
**Spike closed 2026-07-25; LS-8 unblocked.** The run-2 sub-question is settled by the run-3
result itself: the row's free read was still exactly 50.0 (`measured=200.0×50.0`) *after*
`maxHeight = null` plus the forced characters-rewrite re-layout — a re-layout that demonstrably
re-derives height — so the null write is **silently rejected off auto-layout**, mirroring the
`maxLines` silent-reject pin. Moot for verdicts (the binding-agnostic rule never needed the
clear to work), but pinned in agent-guidelines §2 so LS-8 doesn't attempt it.

| Node label | Expected | Observed verdict | Pass? |
|---|---|---|---|
| `fixed-fits` | `fits` | `fits` (23.0×19.0) | ✅ |
| `fixed-overflows` | `overflows` | `overflows` (1244.0×19.0) | ✅ |
| `truncate-fits` | `fits` | `fits` (23.0×19.0) | ✅ |
| `truncate-overflows` | `truncates` | `truncates` (1244.0×19.0) | ✅ |
| `autoheight-fits` | `fits` | `fits` (200.0×19.0, available h 80) | ✅ |
| `autoheight-overflows` | `overflows` | `overflows` (200.0×133.0 > available h 80) | ✅ |
| `autoheight-maxlines` | `truncates` | `truncates` (maxLines-cap; capped 38, free 133) | ✅ |
| `autoheight-maxheight` | `truncates` | run 3: `truncates` (maxHeight-cap, binding-agnostic rule; runs 1–2 were harness gaps) | ✅ |
| `hug-fits` | `fits` | `fits` (23.0×19.0) | ✅ |
| `hug-overflows` | `overflows` | `overflows` (1244.0×19.0, parent-escape) | ✅ |
| `hug-page-parent` | `fits` | `fits` (1244.0×19.0, no-container) | ✅ |
| `missing-font` | `unmeasurable` | `unmeasurable` (missing-font) | ✅ |
| `mixed-font-ok` | measurable | `fits` (24.0×19.0) — measurable | ✅ |
| `rotated-fixed` | `overflows` | `overflows` (AABB 1086.8×638.5) | ✅ |

### maxLines live verification (§3 checklist)

- [x] Clone inherited `maxLines` (`clone.maxLines=2 (model 2)`) and the capped read reflects the
      2-line cap.
- [x] Disabling truncation on the clone allowed free growth (`free h` > `capped h`).
- [x] The height delta confirms the capped-vs-free detection protocol. Observed:
      capped = 38.00, free = 133.00.

### Fidelity observations

- `truncate-*` rows reported `textAutoResize: 'TRUNCATE'` on generate: **yes** — and the console
  emitted Figma's own deprecation warning: *"`textAutoResize` will stop returning `TRUNCATE` in a
  future version — read from `textTruncation` instead."* Pinned in agent-guidelines §2; LS-8
  should treat `TRUNCATE` as `NONE` + `textTruncation === 'ENDING'` internally so the eventual
  removal is a no-op.
- `bounds-sync gap` lines seen: **none** — `absoluteBoundingBox` updates synchronously after a
  `characters` write in every measured mode.
- **`maxHeight` binds outside auto-layout (run-1 FAIL root cause).** The `autoheight-maxheight`
  clone, parented to the page, still stopped at exactly 50.0 with content that free-grows to
  133.0 — the docs' "applicable only to auto-layout frames and their direct children" restricts
  the *write*, not the *enforcement*, and `clone()` carries the cap along. The spec's §2
  clone-fidelity assumption ("the free-standing clone escapes auto-layout constraints") is wrong
  for `maxHeight` specifically. Consequence for the protocol: the free-growth read must clear
  `maxHeight` (like `maxLines`), otherwise "free" growth is still capped and cap detection can
  never fire. Harness fixed accordingly; pinned in agent-guidelines §2.

### Harness implementation notes (already resolved, recorded for LS-8)

- **`containerAvailableHeight` is offset-aware:** for `HEIGHT` mode the harness compares free
  growth against *node-top → container-bottom* (`containerBounds.y + containerBounds.height −
  ownBounds.y`), not the container's raw height — the node's top edge is fixed and growth is
  downward. §2's rule table names the term without defining it; LS-8 should adopt this definition.
- **The free-growth read strips every cap** (`textTruncation = 'DISABLED'`, `maxLines = null`,
  `maxHeight = null`) **and forces a re-layout via a characters rewrite** before re-reading.
  `maxLines` detection stays capped-vs-free. `maxHeight` detection is **binding-agnostic**:
  `max(capped, free) >= maxHeight − ε ⇒ truncates` — correct whether or not the cap can be
  cleared on the clone (run 2 showed clearing may not take effect off auto-layout). LS-8 should
  adopt the binding-agnostic rule, not rely on cap-clearing.
- **`ownBounds === null`** (zero-area/invisible node) is a fifth unmeasurable path (`no-bounds`),
  absent from the §2 table — LS-8 should carry it.
