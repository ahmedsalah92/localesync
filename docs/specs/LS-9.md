# LS-9 — String extraction → keyed list

**Epic:** Features · **Complexity:** Med · **Blocked by:** LS-3, LS-5 · **Blocks:** LS-6, LS-12

Extract every eligible text node in a scope into a keyed list, with a stable per-node key persisted
on the node so the same file yields the same keys across sessions. Per-node identity is
load-bearing: the same string can fit in one container and clip in another (LS-8), and preview
write-back targets a specific node (LS-12). Dedup is an opt-in transform at export only (LS-6),
never the source of truth.

API pins: **`docs/agent-guidelines.md` §2**, and §1 for the main bundle's ES2017 floor. Conventions:
§1, §4, §6. Not repeated here.

---

## 1. Contracts

### 1.1 Consumed — referenced, never redefined (§4)

| Type / value | Owner | Module |
|---|---|---|
| `TextNodeModel` | LS-3 | `src/main/traversal/model.ts` |
| `traverse(scope)`, `collectTextNodes(scope)`, `NoSelectionError` | LS-3 | `src/main/traversal/index.ts` |
| `ExtractedString` | shared | `src/common/models.ts` |
| `BlockedNode`, `BlockReason` | shared | `src/common/models.ts` |
| `ScanScope`, `ErrorCode` | LS-2 | `src/common/messages.ts` |
| `ExtractionRequest`, `ExtractionResult` | LS-2 | `src/common/messages.ts` |
| `ProgressMessage`, `ErrorMessage` | LS-2 | `src/common/messages.ts` |
| `on`, `respond`, `send` | LS-2 | `src/main/bridge.ts` |
| `request`, `on` | LS-2 | `src/ui/bridge.ts` |
| `ResultsRow`, `RowMeta`, `RowTone`, `toneToken` | LS-5 | `src/ui/shell/ResultsRow.tsx` |
| `ResultsList`, `StateView`, `FooterStub` | LS-5 | `src/ui/shell/` |
| `PanelDef`, `PANELS` | LS-5 / LS-8.2 | `src/ui/shell/panels.tsx` |

`ExtractionRequest` is unchanged — it carries `scope` only. No selector ships (default 8), so the
scheme never crosses the bridge; main uses `DEFAULT_SCHEME`.

### 1.2 Upstream amendments this issue requires

**LS-3 — `src/main/traversal/model.ts`.** `buildModel` already collects `frameNames` on its single
upward walk and already holds the live node. Both fields are free at construction and unreachable
afterwards, since `traverse` returns models and `containerLabel` is a joined, depth-capped display
string whose separator LS-5 owns.

```ts
export interface TextNodeModel {
	nodeId: string;
	characters: string;
	name: string;                 // NEW (LS-9) — node.name, the leaf key segment
	ancestorFrameNames: string[]; // NEW (LS-9) — nearest-first, uncapped, raw
	// …unchanged…
	containerLabel: string;       // unchanged; now derived FROM ancestorFrameNames
}
```

`toScannedTextNode` lists its fields explicitly rather than spreading, so neither new field reaches
the wire. `ScannedTextNode` is untouched.

**LS-3 — `src/main/traversal/index.ts`.** `collectTextNodes` becomes exported. Default 15 resolves
ownership page-wide regardless of scan scope, and needs the node sweep without paying for
`buildModel` — the upward walk, `absoluteBoundingBox` and `getRangeAllFontNames` are all unnecessary
to read a stamp.

**LS-5 — `src/ui/shell/ResultsRow.tsx`.** An Extract row carries a verdict only when its string is
duplicated; a required field renders an empty span and its leading gap.

```ts
export interface RowMeta {
	label: string;
	verdict?: string;   // WAS: required
	tooltip?: string;
}
```

The doc comment above `RowMeta` needs a matching edit — it states that every flagged row must carry
a verdict, which is an overflow-panel truth, not a shell-wide one.

**LS-2 — `src/common/models.ts`.** Drift is computed main-side by comparing a stamp against a fresh
derivation from `name` and `ancestorFrameNames`, neither of which crosses the bridge.

```ts
export interface ExtractedString {
	key: string;
	nodeId: string;
	value: string;
	drifted: boolean;   // NEW (LS-9) — stamp no longer matches the derived key
}
```

**LS-2 — `src/common/messages.ts`.** Rejected stamps ride the result rather than a trailing `error`.
A same-id `error` rejects the pending request in the UI bridge, so sending it after the result
arrives unmatched and sending it before loses the entries.

```ts
export interface ExtractionResult extends Envelope<'extraction-result'> {
	entries: ExtractedString[];
	blocked: BlockedNode[];   // NEW (LS-9) — rejected stamps, reason 'instance-locked'
}
```

Neither amendment is a union change: no new message type, the 18-type list and its count test are
untouched. Precedent is LS-8 adding display fields to `overflow-scan-result`.

### 1.3 Owned by LS-9 — main thread

```ts
// src/main/extract/key.ts
// Pure. No `figma` global, no async. Vitest-covered (§6 names key generation explicitly).

export type KeyScheme = 'dot' | 'snake';

export const DEFAULT_SCHEME: KeyScheme = 'dot';
export const MAX_SEGMENT_CHARS = 32;
export const MAX_ANCESTORS = 3;

/** Lowercase; each run of non-[a-z0-9] → a single '_'; trim both ends; cut to
 *  MAX_SEGMENT_CHARS on a '_' boundary. Returns '' when the name holds no
 *  alphanumerics (non-Latin layer names). */
export function slugSegment(name: string): string;

/** Leaf from `model.name`; up to MAX_ANCESTORS nearest frame ancestors emitted
 *  outermost-first. Empty ancestor segments dropped; an empty leaf becomes 'text'.
 *  Joined per scheme. No uniqueness — see uniqueKey. */
export function deriveKey(model: TextNodeModel, scheme: KeyScheme): string;

/** `base` when free in `reserved`, else `${base}_2`, `${base}_3`, … Pure; does
 *  not mutate `reserved`. */
export function uniqueKey(base: string, reserved: ReadonlySet<string>): string;

/** Whether a `stored` key still matches a fresh `derived` key — the negation is drift.
 *  Asymmetric (default 17): `stored === derived`, or `stored === ${derived}_N` for an
 *  integer N ≥ 2; never the reverse. Accepted false negative: stamp `list.item_2`, layer
 *  renamed `Item 2` → `Item`. Storing the pre-suffix base is the exact fix if it matters. */
export function derivesFrom(stored: string, derived: string): boolean;
```

```ts
// src/main/extract/persist.ts
// The envelope codec is pure and unit-testable; only the two thin wrappers touch a node.

export const KEY_DATA = 'localesync:key:v1';   // ':v1' carries the format version

export interface StoredKey {
	k: string;      // the key
	s: KeyScheme;   // which scheme derived it
	n: string;      // owning node id at stamp time
	t?: number;     // Date.now() at stamp time. Optional on read: stamps written
	                // before this field existed parse without it. Always written.
	                // NEVER test with truthiness — 0 is a valid value (default 12).
}

/** Pure. Malformed, empty or shape-wrong input → null; a non-numeric `t` is
 *  shape-wrong. Never throws. */
export function parseStoredKey(raw: string): StoredKey | null;

/** Pure. Requires `t`, so every stamp written carries one. */
export function serializeStoredKey(stored: StoredKey & { t: number }): string;

/** Thin wrapper over getPluginData + parseStoredKey. */
export function readStoredKey(node: TextNode): StoredKey | null;

/** Returns false when Figma rejects the write. Reads the value back to catch a
 *  silent rejection as well as a thrown one — see §3.4 probes 1–3, which decide
 *  whether the read-back stays. Never throws. */
export function writeStoredKey(node: TextNode, stored: StoredKey & { t: number }): boolean;
```

```ts
// src/main/extract/resolve.ts
// Pure. Ownership, uniqueness and drift resolution over claims, testable without
// `figma`. `now` is a parameter, never read from the clock inside.
// derivesFrom is exported by key.ts (above). compareClaims is module-internal: it is
// listed because default 10 is its contract, not because other modules may call it.

/** An in-scope node: resolved, possibly stamped, and returned. */
export type KeyInput = Pick<TextNodeModel, 'nodeId' | 'name' | 'ancestorFrameNames'> & {
	stored: StoredKey | null;   // null = absent or unparseable (default 14)
};

/** Any text node on the page — the claim context. Read, never written. */
export interface PageStamp {
	nodeId: string;
	stored: StoredKey | null;
}

export interface KeyResolution {
	nodeId: string;
	key: string;
	drifted: boolean;
	/** The stamp to write, or null when the node already owns its key — nothing to write. */
	write: Stamp | null;   // Stamp = Required<StoredKey>, exported by persist.ts
}

export interface ResolveOptions {
	/** Date.now() for this pass — the `t` on every stamp it writes. A parameter so this stays pure. */
	now: number;
	/** Every text node on the page, in document order. Ownership and uniqueness are judged
	 *  against this whatever the scan scope: scope decides what is returned, not what is
	 *  considered (default 15). Defaults to the inputs themselves. */
	page?: readonly PageStamp[];
}

/** One resolution per input, in input (document) order. Out-of-scope page nodes shape the
 *  result but never appear in it. Three passes, so every retained key is reserved before any
 *  derivation runs: owners page-wide, the oldest claim winning (compareClaims) and an
 *  in-scope loser falling through like a copy; adopters page-wide; then derivation for every
 *  remaining in-scope node, suffixed against the reserved set. */
export function resolveKeys(
	inputs: readonly KeyInput[],
	scheme: KeyScheme,
	options: ResolveOptions,
): KeyResolution[];

/** INTERNAL — not exported. Which of two owners of one key has the older claim; negative
 *  when `a` wins. An absent `t` reads as 0 (LEGACY_T), so a pre-`t` stamp and an adopted
 *  legacy claim compare as equals; otherwise the smaller `t` wins; a genuine tie falls to
 *  page order. Explicit `=== undefined`, never truthiness. */
function compareClaims(
	a: { stored: StoredKey; order: number },
	b: { stored: StoredKey; order: number },
): number;
```

```ts
// src/main/extract/index.ts

export interface ExtractOptions {
	stamp?: boolean;   // default true. Internal only — never crosses the bridge.
}

export interface ExtractOutcome {
	entries: ExtractedString[];  // document order
	blocked: BlockedNode[];      // rejected stamps, reason 'instance-locked'
}

/** Resolves ownership page-wide (default 15), derives keys for unstamped in-scope
 *  nodes, stamps them, and closes the pass with one figma.commitUndo().
 *  Rethrows NoSelectionError unchanged — LS-3 owns that mapping. */
export async function extractStrings(
	scope: ScanScope,
	scheme: KeyScheme,
	onProgress: (completed: number, total: number) => void,
	options?: ExtractOptions,
): Promise<ExtractOutcome>;

/** Wires the extraction-request/extraction-result pair. Called once from main.ts,
 *  alongside registerTraversal(). */
export function registerExtraction(): void;
```

### 1.4 Owned by LS-9 — UI

```ts
// src/ui/extract/state.ts
// Pure reducer + selectors. Imports types from common only — never ./bridge, which
// assigns a `window` listener at module scope (§6: no jsdom).

export type ExtractPhase = 'idle' | 'scanning' | 'done' | 'failed';

export interface ExtractState {
	phase: ExtractPhase;
	scope: ScanScope;
	entries: ExtractedString[];
	blocked: BlockedNode[];
	completed: number;
	total: number;
	selectedNodeId: string | null;
	errorCode: ErrorCode | null;
}

export function initialExtractState(): ExtractState;
export function extractReducer(state: ExtractState, action: ExtractAction): ExtractState;

/** Exact-value grouping, matching LS-6's dedup rule so the marker predicts what
 *  dedup would collapse. Keyed by nodeId; 1 means not duplicated. */
export function occurrenceCounts(entries: readonly ExtractedString[]): ReadonlyMap<string, number>;

/** Derived from `drifted`, never sent as a scalar. */
export function driftedCount(entries: readonly ExtractedString[]): number;
```

```
src/ui/extract/copy.ts           all user-visible strings, mirroring overflow/copy.ts
src/ui/extract/ExtractPanel.tsx  PanelDef.Panel — owns its control bar, summary band,
                                 scroll region and Pro footer (LS-8.2 §1.7)
```

`PANELS`' `extract` entry swaps `makeStubPanel('Extract', 'Report')` for `ExtractPanel`. The
`Report` footer stub is preserved — LS-13 paid-intent instrumentation, not a placeholder.

---

## 2. Resolved Defaults

### Key derivation

1. **Leaf segment is `model.name`**, never `characters`. A key must survive a copy edit; deriving it
   from content bakes the source language into a language-neutral identifier.
2. **Slug rule:** lowercase; every run of non-`[a-z0-9]` → a single `_`; trim leading and trailing
   `_`. Underscore sits inside LS-6's Android safe set, so segments export unremapped.
3. **Empty segments:** an ancestor slugging to `''` is dropped; a leaf slugging to `''` becomes
   `text`, with uniqueness from rule 6. Covers non-Latin layer names without a transliteration
   dependency.
4. **Segment cap:** 32 characters, cut at the last `_` at or before the limit. No API limit is in
   play — `setPluginData`'s 100 kB ceiling is four orders of magnitude away; this is legibility.
5. **Depth:** the 3 nearest frame-like ancestors emitted outermost-first, plus the leaf — 4 segments
   maximum. On deeper trees the **outermost** frame is dropped, which is usually the screen name.
   Accepted cost; observed live in the fixture, where `deep-tree` yields `l1.l2.l3.total` and its own
   row frame is dropped while every shallower row keeps its name.
6. **Uniqueness:** `_2`, `_3`, … appended against the reserved set.
7. **Reserved set** is seeded with every key claimed by an *owning* stamp before any derivation runs,
   so a new node can never take an existing node's key.
8. **Schemes:** `dot` joins with `.`, `snake` joins with `_`. Both share rules 1–7 entirely; only the
   join differs. `dot` is `DEFAULT_SCHEME`. **No selector ships in Phase 1** — selecting a scheme is
   a re-key operation and there is no re-key story. Under `snake`, segment and word boundaries are
   indistinguishable; inherent to flat snake_case, not a defect.

*Note: the mockup's sample keys show `auth.signin.button`. Rule 2 produces `auth.sign_in.button`. The
samples are illustrative row content, not a specification; the divergence is deliberate.*

### Ownership

9. `stored.n === node.id` → **owns it**. Key used verbatim; no derivation, regardless of position.
10. **Several nodes own the same key** → compare `t ?? 0`; smaller wins; on a tie, earlier in page
    order wins. The loser is treated as a copy per rule 11. Position alone never decides: a stamp's
    recorded time is evidence of originality, its place in the layer list is not.
11. Stamp present, owner present elsewhere → this node is a **copy**: re-derive, suffix, re-stamp.
    The original never loses its key to its own duplicate.
12. Stamp present, no owner, this node its **sole carrier** → **adopts it**, re-stamped with its own
    id. The orphan's `t` is **preserved** — the claim is the same one, so resetting it to now would
    make the oldest claim the youngest. An orphan with no `t` is written as **`t: 0`**, which sorts
    below every real timestamp and so keeps the same meaning under rule 10's numeric comparison.
13. Stamp present, no owner, **several carriers** → none adopts; all re-derive and re-stamp.
    Ambiguity is not resolved by an invisible pick.
14. A stamp that is absent, malformed or unparseable reads as **unstamped**. Never throws.
15. **Ownership, the reserved set and carrier counts are judged page-wide, whatever the scan scope.**
    Scope controls what is returned, not what is considered. Without this, a selection scan can mint
    a key a node outside the selection already owns — a duplicate key in the export, with nothing
    surfacing it — and a copy scanned without its original takes the original's key. **Only in-scope
    nodes are keyed, stamped and returned; out-of-scope nodes are read, never written.**

### Drift

16. Drift is computed for **every** node, stamped or not, by deriving fresh and comparing. Pure
    string work over fields already in the model: no extra API call, nothing stored.
17. **`derivesFrom(stored, derived)` is asymmetric.** The *stamp* may carry a `_N` suffix the
    derivation lacks; never the reverse. Symmetry would let a layer renamed `Welcome` → `Welcome 2`
    derive `home.welcome_2` against stamp `home.welcome` and read as clean. One false negative is
    accepted: a node stamped `list.item_2` whose layer is renamed `Item 2` → `Item` derives
    `list.item` and is masked. Drift is advisory; storing the pre-suffix base in the envelope is the
    exact fix if it ever matters.

### Persistence

18. One `setPluginData` entry per node under `localesync:key:v1`, value `{k, s, n, t}` as JSON.
19. `serializeStoredKey` **requires** `t`, so every stamp written carries one. `parseStoredKey`
    accepts its absence and rejects a non-numeric value. **`t` is never tested for truthiness** — 0
    is valid and meaningful under rule 12.
20. **Stamping happens during the scan**, for every eligible unstamped in-scope node, closed with a
    single `figma.commitUndo()` — one undo step, not one per node. A second scan writes nothing.
21. **Not LS-4 territory.** Plugin data is inert: no layout change, no font load, no prior value to
    restore. The `missing-font` and `mixed-font` gates do not apply and `withSnapshot` is not used.
    `CLAUDE.md`'s missing-font rule is scoped to content and layout for this reason.
22. A rejected write leaves the node unstamped, keeps the derived key for this run, and appends
    `{ nodeId, reason: 'instance-locked' }` to `blocked` **on the result**. The value is read back
    after writing, since it is not known whether Figma rejects by throwing or silently; that
    read-back is temporary and tied to probes 1–3.

### Eligibility

23. **Excluded:** `model.empty`, `model.hidden`.
24. **Included:** `model.locked`, `model.hasMissingFont`, `model.isMixedFont`, `model.inInstance`,
    and text inside component masters. Identical to the overflow scan's filter — a page reporting
    different counts in two tabs reads as a bug. A missing-font node is un-measurable for overflow
    and completely ordinary here, because extraction measures nothing.
25. Mixed-font nodes yield plain `characters`; per-run styling is dropped and not captured. LS-4
    already blocks character mutation on mixed-font nodes, so the write-back constraint lands on
    LS-12.

### Execution

26. **Live nodes via `figma.getNodeByIdAsync(model.nodeId)`**, mirroring `scanOverflow`. `traverse`
    returns models by design — `nodeId` is the durable handle and there is no registry — and
    `getPluginData` / `setPluginData` are node methods, so the lookup is unavoidable.
27. **Entry order is traversal order** (document order). No sort or filter controls exist on the
    Extract band.
28. **Progress on a 25-node tick**, same cadence as the overflow scan, under the request's
    correlation id.
29. **No cancellation.** No `extraction-cancel` type is added. Interruption is safe — stamping is
    idempotent and incremental, so a half-finished scan leaves nothing to repair and the next scan
    completes it. `scan-stopped` is **N/A for Extract**; `docs/design.md`'s state matrix lists it as
    copy owed and should be corrected.
30. Zero eligible nodes is a **valid empty result** (`entries: []`), not an error. Selection scope
    with nothing selected propagates `NoSelectionError` → `no-selection`, per LS-3.
31. **`options.stamp` defaults true and never crosses the bridge.** LS-2's roundtrip harness calls
    `extractStrings` directly with `{ stamp: false }` rather than sending an `extraction-request`,
    so a transport test cannot write to the user's file.
32. **Scans serialize.** One `extractStrings` call runs at a time, so a harness scan and a real scan
    cannot interleave their stamping.

### Surface

33. **Duplicate marker** in `meta.verdict` as `N×` — the same total on every member of the group. No
    ordinal: an ordinal implies an order the user cannot see and re-ties the marker to document
    position. The dedup survivor is **not** marked; dedup defaults off and the row should not imply a
    decision the user has not made. Tooltip carries the explanation.
34. **Drift count in the summary band** beside the string count, from `driftedCount`. Copy owed by
    DES-2; the shipped wording is a placeholder.
35. **The `Export ▸` link is omitted** until LS-6 wires it — a deliberate deviation from a
    signed-off design. A disabled control is a submission risk under LS-16's review checklist and
    teaches users that controls here may do nothing. Bundled with 34 as one band revision for DES-2.
36. `blocked` reaches `ExtractState` intact but is **not rendered** in Phase 1. Copy owed by DES-2,
    same band pass.
37. Row tone is `'neutral'` (`--ls-border-neutral`) with `monoMeta`; `primary` is the string,
    `meta.label` is the key. Both already exist in `ResultsRow`.

---

## 3. Concrete Acceptance

### 3.1 Pure unit tests — `npm test`

| File | Covers |
|---|---|
| `src/main/extract/key.test.ts` | `slugSegment`, `deriveKey`, `uniqueKey` against §3.2 |
| `src/main/extract/persist.test.ts` | envelope round-trip; malformed, empty, shape-wrong, non-numeric `t`; `t: 0` preserved as 0 |
| `src/main/extract/resolve.test.ts` | rules 9–17: all three tiebreak cases, adoption, page-wide reserved set, `derivesFrom` asymmetry |
| `src/ui/extract/state.test.ts` | reducer transitions; `blocked`; `occurrenceCounts`; `driftedCount` |

### 3.2 Derivation case table

Transcribed to `fixtures/extract-cases.json` (generatable, committed). The table below is the
authority; the fixture is its transcription, per §6 — goldens derive from the spec, never
independently. `ancestorFrameNames` is nearest-first, as the model stores it.

| # | `name` | `ancestorFrameNames` | scheme | expected key | exercises |
|---|---|---|---|---|---|
| 1 | `Total` | `["Summary","Checkout"]` | dot | `checkout.summary.total` | baseline |
| 2 | `Button` | `["Sign in","Auth"]` | dot | `auth.sign_in.button` | rule 2 separator |
| 3 | `Welcome back!` | `["Home"]` | dot | `home.welcome_back` | trailing punctuation trimmed |
| 4 | `الإجمالي` | `["Home"]` | dot | `home.text` | empty leaf fallback |
| 5 | `---` | `["Home"]` | dot | `home.text` | punctuation-only leaf |
| 6 | `Total` | `["Rows","Summary","Checkout","App"]` | dot | `checkout.summary.rows.total` | depth cap drops `App` |
| 7 | `Total` | `[]` | dot | `total` | page-level node |
| 8 | `Title` | `["Home / Header"]` | dot | `home_header.title` | separator in a layer name is not a boundary |
| 9 | `A very long descriptive layer name for the total` | `["Summary"]` | dot | `summary.a_very_long_descriptive_layer` | 32-char cut at a `_` |
| 10 | `Total` | `["Summary","Checkout"]` | snake | `checkout_summary_total` | scheme join |
| 11 | `Sign in` | `["Auth"]` | snake | `auth_sign_in` | snake ambiguity, documented not fixed |
| 12 | `الإجمالي` | `["منتجات","Home"]` | dot | `home.text` | empty ancestor dropped, not `home..text` |

`uniqueKey`:

| base | reserved | expected |
|---|---|---|
| `checkout.summary.total` | `{}` | `checkout.summary.total` |
| `checkout.summary.total` | `{checkout.summary.total}` | `checkout.summary.total_2` |
| `checkout.summary.total` | `{…total, …total_2}` | `checkout.summary.total_3` |
| `home.text` | `{home.text}` | `home.text_2` |

### 3.3 In-Figma harness

Persistence fidelity and ownership cannot be proved under Vitest — §6 is explicit that a faked
`figma` runtime cannot carry this. `src/main/extract/check.ts` holds the assertions and streams
`progress` notes prefixed `ls9:`; `src/ui/extract-check.ts` is a thin trigger behind a dev-only
button. It piggybacks on a real `extraction-request`.

**Fixture: `fixtures/extract-keys.fig`** — its own file, not `kitchen-sink.fig`, because this harness
**writes plugin data** and stamping the shared traversal fixture would leave `localesync:key:v1` on
nodes the LS-3 and LS-4 harnesses re-scan. Bootstrapped by the dev-only **Generate extract-keys**
button (`src/main/devtools/generateExtractKeys.ts`), then finished by hand per
`fixtures/extract-keys.md`. 14 rows.

Two properties of the fixture worth stating, because both are load-bearing and neither is obvious:

- **The container is a group, not a frame.** A frame would be counted as a frame ancestor by
  `deriveKey` and as the outermost frame by the harness's row assignment — so `collision-pair` would
  cease to work as a row sentinel and every key would gain a prefix. Both failures are silent.
- **The fixture ships with no plugin data.** `tiebreak` and the adoption rows are plain layers; the
  harness forges their stamps at runtime and undoes them in `finally`.

The harness **clears stamps before it runs**, so its own `virgin-stamps` line is never evidence about
the state a file arrived in.

Assertions: 33, all passing as of the run recorded in §3.4. Keys for every row match §3.2's rules;
rescan writes nothing and reports zero drift; a rename leaves keys unchanged and raises drift by
exactly one; a duplicate takes `_2` while the original keeps its key; an ownerless stamp is adopted
with `n` rewritten; a selection scan neither collides with nor touches an out-of-scope owner; and
both tiebreak cases place the older claim on the later node in page order, so a document-order rule
would fail them.

### 3.4 Probe results

Pinned into `agent-guidelines.md` §2.

| # | Question | Result |
|---|---|---|
| 1 | `setPluginData` on an instance child of a **local** component | **Lands.** 1 stamped, 0 blocked. |
| 2 | Same, **published-library** component | **Not run** — the `library-instance` row is unbuilt. Carried forward. |
| 3 | `setPluginData` on a **locked** node | **Lands.** 1 stamped, 0 blocked. |
| 4 | Does a duplicated node carry the stamp? | **Yes**, via `clone()`. Cmd-D is assumed equivalent, not measured. |
| 5 | Do node ids survive **file duplication**? | **Yes.** The same group reports id `17:44` in both original and copy. |
| 6 | Does a stamp batch revert as one undo step? | **Not run.** Carried forward — see below. |
| 7 | Programmatic selection of a **locked** node | **Lands.** |

**No write has ever been rejected.** Probes 1 and 3 both report zero blocked, so default 22's
rejection path — `writeStoredKey` returning false, `instance-locked` in `blocked` — has not fired in
a real runtime. It stays, because probe 2 is unresolved, but the spec does not claim it is exercised.

**Probe 5 makes adoption the narrow path.** Node ids survive duplication, so a duplicated file's
stamps still name owners that exist and rule 9 handles them. Rule 12 is reached by delete-and-replace
and by forged state, not by the everyday act of duplicating a file. One observation, one Figma
version, one method of duplication — evidence, not a guarantee; adoption stays regardless.

**Probe 6 needs a read-only counter to be answerable.** Re-running the harness clears stamps before
counting them, and the harness's own teardown creates undo groups after the stamp batch, so a single
Cmd-Z reverts the teardown rather than the batch. Answering it cleanly needs a dev command that
counts stamped nodes and writes nothing. Carried forward: it tests undo ergonomics, not correctness,
and no LS-9 behaviour depends on the answer.

### 3.5 Run

```
npx tsc -b && npx eslint . && npm test && npm run check:docs
npm run build && npm run check:dist
npm run dev          # then open fixtures/extract-keys.fig
                     # → "Run LS-9 extract check" in the dev harness → console
```

---

## 4. API pins

`docs/agent-guidelines.md` §2 — `documentAccess: "dynamic-page"` and `getNodeByIdAsync`,
`setPluginData`'s string-only value and 100 kB entry cap, and the probe results above. §1 for the
main bundle's ES2017 floor, which is invisible from source and total when violated.

`clientStorage` is unused here — the key lives on the node, not in a manifest.

---

## Carried forward

- **Probe 2 — `library-instance`.** The row is unbuilt and needs library publishing on the plan.
  Until then, whether a read-only subtree rejects the write is unknown.
- **Probe 6 — undo grouping.** Needs a read-only stamped-node counter, ten lines behind the dev flag.
- **A re-key control.** Without one, a key stamped from a badly-named layer on day one is permanent,
  and any future scheme selector is blocked — changing scheme is a re-key.
- **LS-14:** disclose that scanning stores keys on layers; copy for the drift count and for `blocked`.
- **LS-15:** a selection scan now pays a full-page `findAllWithCriteria` plus one `getPluginData` per
  text node, so scan cost no longer scales with selection size. Up to ~2k writes on a first scan.
- **DES-2:** band revision (33–36), and `scan-stopped` marked N/A for Extract in `docs/design.md`.
- **LS-25 follow-on:** the verdict slot sits at the row's right edge, adding a second caller for the
  portal-based tooltip fix.
- **LS-6, when specced:** reconcile the agent-ready draft (Parrot → Gleef; `TRUNCATE` is a live value
  per LS-8.1; dedup is decision #3, not #5), and scope `keyMap` to collisions — under `dot` every key
  remaps on `.`, so a 100%-populated map traces nothing. `snake` exports Android-native and
  unremapped.
- **Harness defect:** `library-instance-no-throw` asserts "extraction completed with the row present"
  while probe 2 reports the row absent. Whatever condition it reads, it is not row presence. Fix
  before the assertion is cited as evidence.