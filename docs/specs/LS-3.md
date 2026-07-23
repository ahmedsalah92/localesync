# LS-3 — Scene-graph traversal + text-node model

**Epic:** Foundation · **Blocked by:** LS-1 (done), FIX-1 (kitchen-sink — acceptance only) · **Owns:** `src/main/traversal/`

Read-only "find and describe every relevant text node" layer that all features sit on. Async
traversal under `dynamic-page`; produces the per-node model the plugin sits on and maps its
serializable subset onto the LS-2 `ScannedTextNode` wire DTO. Never mutates.

---

## 1. Contracts

### Produces — `TextNodeModel` (main thread only)

Lives in `src/main/traversal/model.ts`. Uses `@figma/plugin-typings` ambient types (`Rect`,
`FontName`, `TextNode`). **Not serializable, never exported to `src/common`** — it holds values
that cannot cross the bridge (`figma.mixed`, `FontName`). This is the rich model LS-8/LS-9 consume
(per agent-guidelines §4, which names exactly this: *"LS-8 and LS-12 consume `TextNodeModel` from
… `src/main/traversal`"*).

```ts
// src/main/traversal/model.ts — OWNED by LS-3. Main-thread only. NOT serializable.
export interface TextNodeModel {
	nodeId: string;
	characters: string;

	// resize / truncation — RAW API values, NOT interpreted (see Resolved Defaults §2, Flag B).
	textAutoResize: TextNode['textAutoResize']; // incl. legacy 'TRUNCATE' (read-only, never written)
	textTruncation: TextNode['textTruncation'];
	maxLines: number | null; // meaningful only when textTruncation === 'ENDING'
	maxHeight: number | null; // populated only for auto-layout children; second truncation trigger

	// geometry (ambient figma Rect; main-side only)
	ownBounds: Rect | null; // node.absoluteBoundingBox — may be null (zero-area / invisible)
	containerBounds: Rect | null; // immediate parent's absoluteBoundingBox; null if parent is the page
	parentClipsContent: boolean; // context for LS-7 ancestor selection; false when parent has no such prop
	rotation: number; // degrees, -180..180

	// display path (Resolved Defaults §14), e.g. "home / header". Added during implementation:
	// toScannedTextNode(model) is single-argument and the DTO carries containerLabel, so the
	// model must hold it.
	containerLabel: string;

	// fonts — main-side only (FontName & figma.mixed are non-serializable)
	fonts: FontName[]; // single → [fontName]; mixed → getRangeAllFontNames(0, len); empty → []
	isMixedFont: boolean; // node.fontName === figma.mixed

	// flags
	hasMissingFont: boolean; // node.hasMissingFont
	inInstance: boolean; // any ancestor is an INSTANCE
	locked: boolean; // effective — self OR any ancestor locked (see Resolved Defaults)
	hidden: boolean; // effective — self OR any ancestor not visible (see Resolved Defaults)
	empty: boolean; // characters.length === 0
}
```

### Produces — public API (`src/main/traversal/index.ts`)

```ts
import type { ScanScope } from '../../common/messages';
import type { ScannedTextNode } from '../../common/models';
import type { TextNodeModel } from './model';

/** Await current-page load, walk the scope, return a fresh model per eligible text node.
 *  No persistent registry — the durable cross-message handle is `nodeId` (re-fetched by
 *  consumers via figma.getNodeByIdAsync). */
export async function traverse(scope: ScanScope): Promise<TextNodeModel[]>;

/** Serializable projection for the bridge. Pure (no figma access). */
export function toScannedTextNode(model: TextNodeModel): ScannedTextNode;

/** Registers the `scan-request` handler on the LS-2 bridge. Called from main.ts. */
export function registerTraversal(): void;
```

`registerTraversal` wires one handler: `on('scan-request', …)` → resolve `scope` → `traverse` →
`respond<'scan-request'>(id, { nodes: models.map(toScannedTextNode) })`, with the empty-scope
error paths in Resolved Defaults §9. **LS-3 adds no message types** — it reuses the LS-2
`scan-request`/`scan-result` pair, satisfying LS-2's "features only add handlers, never touch the
transport."

### Wire DTO — `ScannedTextNode` left unchanged (Flag A resolution)

The two-type split is honored: **all** new issue-required fields land on `TextNodeModel`
(main-side); the wire DTO carries only what the results list + jump-to-node render, which the LS-2
stub already covers (`nodeId`, `characters`, `containerLabel`, and the six flags). **LS-3 does not
modify `src/common/models.ts`.** Measurement fields (`textAutoResize`, bounds, truncation,
`maxLines`, `maxHeight`), font refs, and `figma.mixed` stay off the wire; LS-8 re-fetches live by
id and re-measures rather than trusting a snapshot. If a UI mode-tag is later wanted, adding
`textAutoResize` to the DTO is a one-line in-place expansion of the LS-2-owned stub (never a fork).

### Consumes (reference, never redefine)

- `ScannedTextNode` — `src/common/models.ts` (LS-2).
- `ScanScope`, `ErrorCode`, `ScanRequest`, `ScanResult`, `ErrorMessage`, `RequestResponse` — `src/common/messages.ts` (LS-2).
- `on`, `respond`, `send`, `nextMainId` — `src/main/bridge.ts` (LS-2).
- Figma Plugin API — pinned in agent-guidelines §2 and §4 (this spec); consult the live docs for anything unpinned.

---

## 2. Resolved Defaults (use exactly these)

1. **Traversal primitive** → `figma.currentPage.findAllWithCriteria({ types: ['TEXT'] })`. It
   descends the whole subtree, including into frames, groups, components, and **instances**, and
   returns `TextNode[]` — satisfying the walk-into-instances requirement without hand recursion.
2. **Page load** → `await figma.currentPage.loadAsync()` **before** any traversal call. Under
   `dynamic-page`, `findAllWithCriteria` on a PageNode throws otherwise. Do **not** use
   `figma.loadAllPagesAsync()` (that is for cross-page / `documentchange`, and forces a full-doc
   load LS-3 does not need).
3. **`figma.skipInvisibleInstanceChildren`** → leave at its default `false`. LS-3 must characterize
   hidden nodes (never silently drop); `true` would omit invisible instance children.
4. **Selection scope** → read `figma.currentPage.selection`. For each selected node: if
   `node.type === 'TEXT'`, include it; if it is a container (has `findAllWithCriteria`), include
   `node.findAllWithCriteria({ types: ['TEXT'] })`. De-dup by `id`. (Selection nodes are on the
   already-loaded current page, so no per-node `loadAsync`.)
5. **Own bounds** → `node.absoluteBoundingBox` (the layout box; excludes shadows/strokes), not
   `absoluteRenderBounds`. Type `Rect | null` — may be `null` for zero-area or invisible nodes;
   record it as-is, never drop the node.
6. **Container bounds** → the **immediate** parent's `absoluteBoundingBox`; `null` when
   `parent.type === 'PAGE'` (pages have no box). *Which* ancestor is the "overflow container"
   (immediate vs. nearest clipping vs. auto-layout parent) is an **LS-7** decision — LS-3 records
   the immediate parent box and `parentClipsContent` only. (carry-forward → LS-7)
7. **`parentClipsContent`** → `true`/`false` from `parent.clipsContent` **only** when the parent is
   frame-like (`FRAME` / `COMPONENT` / `COMPONENT_SET` / `INSTANCE`); `false` otherwise (groups,
   sections without the prop, page). Guard by `parent.type`, never `'clipsContent' in parent`
   (Figma's documented guidance; the prop was removed from groups).
8. **`rotation`** → `node.rotation` verbatim (degrees, `-180..180`, about the node's top-left).
9. **`hidden` / `locked` = effective** (self OR any ancestor). `node.visible` / `node.locked` are
   self-only; walk `node.parent` to the page and OR the ancestors. Rationale: SC1 counts *visible*
   nodes — a node inside a hidden frame must read `hidden: true`, not visible. (See §3 precision
   fix.)
10. **`inInstance`** → `true` iff any ancestor's `type === 'INSTANCE'`. Override-ability / lock of
    instance children is LS-4's concern and is **not** computed here.
11. **`empty`** → `node.characters.length === 0`. Empty nodes are tagged, traversed, never dropped.
12. **Fonts** → single-font `[node.fontName as FontName]`; mixed
    (`node.fontName === figma.mixed`) → `node.getRangeAllFontNames(0, node.characters.length)`;
    empty → `[]`. All reads — LS-3 never calls `loadFontAsync` and never mutates, so missing-font
    nodes are read and flagged (`hasMissingFont: true`), never loaded.
13. **`maxLines` / `textTruncation` / `maxHeight` — captured raw, interpreted nowhere (Flag B).**
    Store the three verbatim. Add **no** derived field (`willTruncate`, `effectiveMaxLines`, etc.).
    Their overflow semantics are an unverified API gap (issue / brief §12) owned by **LS-7**.
    (carry-forward → LS-7)
14. **`containerLabel`** (DTO, display-only) → nearest named ancestor frames, joined `' / '`,
    depth-capped at 3, using layer names. Overlaps LS-9's per-node key path but is **separate**:
    LS-9 owns keys; keep the derivations aligned so they don't visibly diverge, but do not couple
    them.
15. **Empty-scope handling** → selection scope with empty selection → `error` `no-selection`
    (severity `error`). Scope traversed but zero text nodes → `scan-result { nodes: [] }` (the UI
    empty-state owns it, LS-14), **not** an error. Unexpected failure → `error` `internal`.
16. **Type checks by `node.type`, never `'prop' in node`** — throughout derivation (parent kind,
    `clipsContent`, instance detection). Figma's typings do not guarantee `in` on group nodes.

**Pure seams to factor out** (so the acceptance unit tests need no `figma` global):
`deriveContainerLabel(names: string[]): string`, `resolveEffectiveFlags(selfLocked, selfVisible,
ancestors: { locked: boolean; visible: boolean }[]): { locked; hidden }`, and
`toScannedTextNode(model)`.

---

## 3. Concrete Acceptance

### Fixture — `fixtures/kitchen-sink.fig` (FIX-1 / LS-17)

`.fig` is human-built (§6). **This table is the LS-3 build sheet for the traversal slice of
FIX-1** — one labelled text node per row, each exercising a requirement or edge case. Expected
values are the golden set the integration harness diffs against (derived from the resolved rules
above, per §6 — never hand-typed independently).

| Node label | Setup | Expected model (key fields) |
|---|---|---|
| `auto-width` | `textAutoResize: WIDTH_AND_HEIGHT`, single font, plain frame | `textAutoResize: 'WIDTH_AND_HEIGHT'`, `isMixedFont: false`, `hasMissingFont: false`, `inInstance: false`, `hidden: false`, `locked: false` |
| `auto-height` | `HEIGHT`, fixed width | `textAutoResize: 'HEIGHT'` |
| `fixed` | `NONE` | `textAutoResize: 'NONE'` |
| `truncating` | fixed size, `textTruncation: ENDING` | `textAutoResize: 'TRUNCATE'` (live-observed: fixed size + truncation reports the deprecated TRUNCATE mode, not just legacy files), `textTruncation: 'ENDING'`, `maxLines: null` (Max lines is only exposed when truncation is enabled AND resizing is auto-height/auto-width — hug in auto-layout; unavailable on fixed size, so the write is rejected) |
| `truncating-maxlines` | `HEIGHT`, `textTruncation: ENDING`, `maxLines: 2` | `textAutoResize: 'HEIGHT'`, `textTruncation: 'ENDING'`, `maxLines: 2` (raw, uninterpreted) |
| `autolayout-maxheight` | direct child of an auto-layout frame, `HEIGHT`, `maxHeight: 80` | `maxHeight: 80` (raw) |
| `mixed-font` | two fonts in one node | `isMixedFont: true`, `fonts.length >= 2` |
| `missing-font` | references an unavailable font | `hasMissingFont: true`; present in output (not dropped), never mutated |
| `empty` | `characters === ''` | `empty: true` |
| `nested-instance` | text ≥2 instances deep (frame → instance → instance → text) | found (SC2); `inInstance: true` |
| `component-override` | instance text overridden from its main | `inInstance: true`; `characters` = overridden value |
| `in-group` | text inside a `GroupNode` (and a boolean/vector group variant) | found + characterized; `parentClipsContent: false` |
| `zero-size` | zero-width or zero-height | present; `ownBounds` is `0`-sized or `null` — not dropped |
| `rotated` | `rotation: 30` | `rotation: 30`; `ownBounds` is the axis-aligned box |
| `hidden-self` | `visible: false` | `hidden: true` |
| `hidden-ancestor` | visible node inside an invisible frame | `hidden: true` (effective) |
| `locked-ancestor` | unlocked node inside a locked frame | `locked: true` (effective) |

### Pure unit tests (Vitest, no `figma`) — `src/main/traversal/*.test.ts`

- `toScannedTextNode(model)` → projects to exactly the nine DTO fields; drops every main-side field.
- `deriveContainerLabel(names)` → correct join, `' / '` separator, depth cap 3.
- `resolveEffectiveFlags(...)` → `hidden`/`locked` OR-fold over a mock ancestor chain (self-visible node under an invisible ancestor → `hidden: true`; self-unlocked under a locked ancestor → `locked: true`).
- classification → `empty` for `''`; `isMixedFont` for a `figma.mixed` sentinel input.

### Integration (dev-only, real runtime) — `__test:traversal`

Dev-gated behind `import.meta.env.DEV` as a UI button (the LS-2 roundtrip-harness pattern; not a
manifest command). Runs `traverse('page')` and `traverse('selection')` against the open
`kitchen-sink.fig` and reports per-label pass/fail in the UI. Asserts:

- [ ] Every labelled node appears with the expected `textAutoResize` and font flags (SC1).
- [ ] `nested-instance` is found and `inInstance: true` (SC2).
- [ ] `missing-font` and `mixed-font` are flagged, present, never dropped (SC3).
- [ ] `truncating` / `autolayout-maxheight` capture `textTruncation` / `maxLines` / `maxHeight` raw.
- [ ] `hidden-*` and `locked-ancestor` resolve **effective** flags.
- [ ] Selection scope over one subtree returns only that subtree's text nodes; empty selection → `no-selection` error.

### Run

- Pure: `npm test`
- Integration: `npm run dev` → open `fixtures/kitchen-sink.fig` → dev-only **Run LS-3 traversal check** button. **Blocked by FIX-1**; the pure tests are not.

### Precision fix (issue SC1 — applied)

Issue SC1 tightened from *"returns every visible text node…"* (ambiguous: self vs. effective) to:

> On the kitchen-sink fixture, returns every text node whose **effective** visibility is visible
> (the node and all ancestors visible), with correct `textAutoResize` mode and font flags, and
> tags hidden nodes (`hidden: true`) rather than dropping them.

Wording precision fix — it names the resolved-default already chosen (§2 rule 9), not a re-scope.
Apply the tightened text to LS-3 SC1 in Linear.

---

## 4. API pins

Baseline pins (dynamic-page → `getNodeByIdAsync`; fonts / `figma.mixed`; `textAutoResize` /
`textTruncation` / `maxLines` / `maxHeight`; serializable set) live in **agent-guidelines §2** —
referenced, not repeated. Four surfaces this spec relies on were verified live and have been
**folded upstream into agent-guidelines §2** during implementation (listed here for traceability):

- **Current-page load before traversal** — `PageNode.findAllWithCriteria()` throws under
  `dynamic-page` unless the page is loaded first; use `await figma.currentPage.loadAsync()`.
  <https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/>
- **`TextNode.maxHeight`** — `number | null`, "applicable only to auto-layout frames and their
  direct children"; readable everywhere, populated only for auto-layout children.
  <https://developers.figma.com/docs/plugins/api/TextNode/>
- **`clipsContent`** — frame-like nodes only; **removed on group nodes**. Guard by `node.type`.
  <https://developers.figma.com/docs/plugins/api/FrameNode/>
- **`rotation`** — degrees, `-180..180`, about the top-left, position-independent.
  <https://developers.figma.com/docs/plugins/api/properties/nodes-rotation/>
