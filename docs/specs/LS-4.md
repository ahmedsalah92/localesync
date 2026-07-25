# LS-4 — Font-load + snapshot/restore primitive ⚠️

**Epic:** Foundation · **Blocked by:** LS-3, FIX-1 (`snapshot-restore.fig` — acceptance only) ·
**Owns:** `src/main/snapshot/` · **Mandatory human review before merge** (agent-guidelines §8).

The durable snapshot/restore primitive under every canvas-mutating feature (pseudo-loc, RTL
mirror, preview). Holds the **canonical definition of the property-complete-restore guarantee**
referenced in brief §13: after apply-then-restore, every mutated property is returned to its
prior value, verified by a re-scan diff against the LS-3 model. Batch-first by design
(agent-guidelines §5 scope note) — whether overflow measurement also consumes it is an **LS-7
output**, not assumed here.

**Design model (normative):**

1. **Durable before mutate.** A node's snapshot is written to its `setPluginData` and its id to a
   `clientStorage` manifest *before* the first mutation touches it. Only then mutate.
2. **Restore is the inverse and clears the durable record.** Idempotent: no snapshot → no-op.
3. **The safety guarantee is restore-on-launch, not the close handler.** On plugin start, a
   non-empty manifest means a previous session ended mid-mutation — restore it (async is fine at
   launch). `figma.on('close')` does only a best-effort *synchronous* restore of in-memory refs.
4. **Ineligible nodes are blocked up front, never touched.** Eligibility is a deterministic
   per-op table (Resolved Defaults §1) over LS-3's flags — no runtime probing.
5. **Batches are all-or-nothing.** Any failure mid-batch restores every node already mutated in
   that call before returning.

---

## 1. Contracts

### Produces — `src/main/snapshot/` (main thread)

```ts
import type { BlockReason, BlockedNode } from '../../common/models'; // owned upstream — never redeclared here

export type MutationOp = 'pseudoloc' | 'rtl-mirror' | 'preview';

export const SNAPSHOT_KEY = 'localesync:snapshot:v1';           // setPluginData key per node
export const MANIFEST_KEY = 'localesync:mutation-manifest:v1';  // clientStorage key

export interface TextNodeSnapshot {
	schemaVersion: 1;
	nodeId: string;
	op: MutationOp;
	characters: string;
	textAutoResize: TextNode['textAutoResize']; // incl. legacy 'TRUNCATE' — preserved on read, never written
	textTruncation: TextNode['textTruncation'];
	maxLines: number | null; // meaningful only when textTruncation === 'ENDING'
	width: number;
	height: number;
	x: number;
	y: number;
	textAlignHorizontal: TextNode['textAlignHorizontal'];
	textAlignVertical: TextNode['textAlignVertical'];
	capturedAt: number; // Date.now()
}

export type Manifest = Record<string, { op: MutationOp; capturedAt: number }>; // keyed by nodeId

// Derivable from LS-3's TextNodeModel or from a live TextNode; keeps eligibility pure.
export interface EligibilityFlags {
	hasMissingFont: boolean;
	isMixedFont: boolean;
	inInstance: boolean;
	empty: boolean;
}

export interface RestoreResult {
	nodeId: string;
	restored: boolean;
	reason?: string;
}

export interface BatchResult {
	succeeded: string[]; // node ids mutated and durably recorded
	blocked: BlockedNode[]; // skipped up front, never touched — feeds the 'nodes-blocked' error message
	failed: { nodeId: string; error: string }[]; // attempted, rolled back
}

export class SnapshotError extends Error {
	code: 'MISSING_FONT' | 'PERSIST_FAILED' | 'NODE_GONE' | 'RESTORE_FAILED';
	nodeId: string;
}

/** Pure. Op × flags → the reason this node must NOT be mutated, or null if eligible. */
export function mutationBlockReason(flags: EligibilityFlags, op: MutationOp): BlockReason | null;

/** Loads every font the node uses (mixed → getRangeAllFontNames(0, characters.length)).
 *  Throws SnapshotError('MISSING_FONT') if node.hasMissingFont. */
export async function ensureFontsLoaded(node: TextNode): Promise<void>;

/** Guarded batch: eligibility gate → ensureFontsLoaded → durable capture → mutate(node).
 *  ONE manifest read-modify-write per batch, not per node.
 *  On ANY failure, every node already mutated in this call is restored before returning. */
export async function withSnapshot(
	nodes: readonly TextNode[],
	op: MutationOp,
	mutate: (node: TextNode) => Promise<void>,
): Promise<BatchResult>;

/** Restores one node from its durable snapshot in the per-mode order (Resolved Defaults §3),
 *  then clears its pluginData entry and manifest entry. Idempotent. */
export async function restoreNode(nodeId: string): Promise<RestoreResult>;

/** Restores every node id in the manifest. Called on plugin launch (main.ts, before any handler
 *  registration) and on explicit Revert. */
export async function restoreAll(): Promise<BatchResult>;

/** Registers the synchronous best-effort close handler over this session's in-memory refs.
 *  NOT the safety guarantee (agent-guidelines §2, Lifecycle & safety). */
export function registerCloseHandler(): void;
```

### Consumes (reference, never redefine)

- `BlockReason`, `BlockedNode` — `src/common/models.ts` (relocated to common because the `error`
  message carries them across the bridge; LS-4 imports, never declares).
- `ErrorCode` values `'mutation-failed'` and `'nodes-blocked'`, `ErrorMessage` —
  `src/common/messages.ts` (LS-2). `withSnapshot` failures surface as `mutation-failed`
  (severity `error`); non-empty `blocked` surfaces as `nodes-blocked` (severity `warning`).
- `TextNodeModel` flags (`hasMissingFont`, `isMixedFont`, `inInstance`, `empty`) —
  `src/main/traversal/model.ts` (LS-3) — the source of `EligibilityFlags` when a scan precedes
  the mutation; live-node derivation is the fallback.
- Figma Plugin API — agent-guidelines §2, plus the two pins in §4 of this spec.

---

## 2. Resolved Defaults (use exactly these)

1. **Eligibility table** — deterministic, no runtime probing:

   | Flag | `pseudoloc` | `preview` | `rtl-mirror` | `BlockReason` |
   |---|---|---|---|---|
   | `hasMissingFont` | blocked | blocked | blocked | `missing-font` |
   | `empty` | blocked | blocked | blocked | `empty` |
   | `isMixedFont` | blocked | blocked | allowed | `mixed-font-char-mutation` |
   | `inInstance` | allowed | allowed | blocked | `instance-locked` |

   Rationale: `pseudoloc`/`preview` write `characters` — on a mixed-font node that flattens
   per-range styling; `rtl-mirror` is layout-only, so mixed fonts are safe. Instance children
   accept `characters` overrides but cannot be repositioned, so only the layout op blocks on
   `inInstance`. First matching row wins, checked top-to-bottom.

2. **Durable-before-mutate order per batch:** filter ineligible → for each eligible node,
   `ensureFontsLoaded` → serialize snapshot → `setPluginData(SNAPSHOT_KEY, json)` → add to an
   in-memory manifest delta → **one** `clientStorage` read-modify-write for the whole batch →
   only then run `mutate` over the batch. The manifest write precedes the first mutation.

3. **Per-mode restore order** (in `restoreNode`; the `resizeWithoutConstraints`-resets-
   `textAutoResize` gotcha in agent-guidelines §2 drives the branching):
   1. `ensureFontsLoaded` (throws `RESTORE_FAILED` per §5 below if it can't).
   2. Set `characters`.
   3. By captured `textAutoResize`:
      - `'NONE'` → `resizeWithoutConstraints(width, height)` → set `textAutoResize = 'NONE'`.
      - `'HEIGHT'` → `resizeWithoutConstraints(width, height)` → set `textAutoResize = 'HEIGHT'`
        (height re-derives from content; width came from the resize).
      - `'WIDTH_AND_HEIGHT'` → set `textAutoResize` only — **no resize** (the box re-derives;
        resizing first would be immediately overwritten and needlessly reset the mode).
      - `'TRUNCATE'` (legacy) → **no resize, no mode write** (the value cannot be written back;
        our ops never alter a fixed box, so there is nothing to resize). Characters restore is
        sufficient.
   4. Set `textTruncation`; set `maxLines` only if captured `textTruncation === 'ENDING'`.
   5. Set `x`, `y`.
   6. Set `textAlignHorizontal`, `textAlignVertical`.
   7. Clear the node's `SNAPSHOT_KEY` pluginData; remove the node from the manifest.

4. **Undo policy (the decision the issue defers here):**
   - `figma.commitUndo()` after each successful batch apply and after each successful restore —
     each plugin operation is one discrete step in Figma's undo history, instead of the default
     where every plugin action across the session collapses into a single step.
   - Restore writes **absolute snapshot values**, so it converges to the captured state
     regardless of any user Cmd-Z interleaved between apply and restore — idempotence by
     construction, not by tracking.
   - `figma.triggerUndo()` is **never called** — Figma's undo stack is never the restore
     mechanism. User-driven undo/redo *after* our restore is native behavior we do not fight.

5. **Font unavailable at restore time** (edge case in the issue): `ensureFontsLoaded` failure
   during restore → `RESTORE_FAILED`; the snapshot **and** manifest entry are **kept** so
   restore-on-launch retries on a machine that has the font; surfaced via `error`.

6. **`NODE_GONE`:** `figma.getNodeByIdAsync(id)` returns `null` or a non-TEXT node → the user
   deleted it; drop the manifest entry, return `{ restored: false, reason: 'NODE_GONE' }`, never
   throw.

7. **Persistence guards:** if `JSON.stringify(snapshot).length > 90_000`, throw
   `PERSIST_FAILED` **before** mutating (100 kB pluginData entry cap, guidelines §2). On read,
   an unrecognized `schemaVersion` → best-effort restore of the fields present, log, don't throw.

8. **Zero-size restore:** `width`/`height` are captured from a live node, which Figma already
   floors at 0.01 — `resizeWithoutConstraints` therefore never receives an illegal value.
   Assert (dev builds), don't clamp.

9. **Snapshot property set is closed** to what the three Phase-1 ops can change (the shape in
   §1). `maxHeight`/`minWidth`/etc. are deliberately absent — no Phase-1 op writes them. Any new
   op that mutates an uncaptured property **expands `TextNodeSnapshot` in place here first**
   (agent-guidelines §4), never snapshots ad hoc.

10. **Harness registration:** dev-gated UI button **Run LS-4 snapshot check** (the LS-3
    `check.ts` pattern), wired via `registerSnapshotCheck()` behind `import.meta.env.DEV`. The
    name `__test:roundtrip` is taken by the LS-2 transport harness — do not reuse it.

**Carry-forwards (open by design, not blockers):**

- **→ LS-7:** whether overflow measurement consumes this primitive (Approach B) or an off-canvas
  clone (Approach A). This spec is batch-first either way; if B is selected, throughput is
  benchmarked in LS-15.
- **→ LS-11:** true RTL mirroring also mutates frame-level properties (positions, auto-layout
  direction) that `TextNodeSnapshot` does not carry. v1 is **TextNode-only**; when the LS-20
  ruleset defines what mirroring actually touches, LS-11 flags LS-4 upstream and the snapshot is
  expanded in place — never forked.

**Pure seams** (so the unit tests need no `figma` global): `mutationBlockReason`, snapshot
serialize/deserialize, manifest merge/remove helpers, and the restore-order **plan** as data —
`planRestore(snapshot): RestoreStep[]` — executed by a thin impure applier.

---

## 3. Concrete Acceptance

### Fixture — `fixtures/snapshot-restore.fig` (FIX-1)

Human-built (§6); **this table is the build sheet for the FIX-1 slice** (`fixtures/
snapshot-restore.md` derives from it, never independently). One labelled text node per row.

| Node label | Setup | Expected (`pseudoloc`) | Op deltas |
|---|---|---|---|
| `auto-width` | `textAutoResize: WIDTH_AND_HEIGHT` | mutated + restored property-complete | — |
| `auto-height` | `HEIGHT`, fixed width | mutated + restored property-complete | — |
| `fixed` | `NONE` | mutated + restored property-complete | — |
| `truncating` | `NONE`, `textTruncation: ENDING`, `maxLines: 2` | restored incl. truncation + `maxLines` | — |
| `legacy-truncate` | `textAutoResize: TRUNCATE` (legacy-file node) | restored; mode untouched, never written | authorable only from a legacy file — skip the row if unobtainable, note it in `snapshot-restore.md` |
| `missing-font` | unavailable font | **blocked** `missing-font`; never touched | blocked for all ops |
| `mixed-font` | two fonts in one node | **blocked** `mixed-font-char-mutation` | **allowed** for `rtl-mirror` |
| `instance-child` | text inside an instance | mutated + restored (characters overridable) | **blocked** `instance-locked` for `rtl-mirror` |
| `empty` | `characters === ''` | **blocked** `empty` | blocked for all ops |
| `rotated` | `rotation: 30` | mutated + restored incl. `x`/`y` | — |
| `zero-size` | zero-width/height | mutated + restored (dims floored at 0.01 by Figma; harness compares against the re-scan, not authored values) | — |

### Pure unit tests (Vitest, no `figma`) — `src/main/snapshot/*.test.ts`

- `mutationBlockReason` — full op × flag matrix from Resolved Defaults §1, including precedence
  (a node that is both `hasMissingFont` and `empty` → `missing-font`).
- Snapshot serialize → deserialize round-trip; unrecognized `schemaVersion` tolerated.
- Manifest merge/remove helpers — add batch, remove node, idempotent removal.
- `planRestore` — emits the exact per-mode step sequence of Resolved Defaults §3 for each of the
  four `textAutoResize` values (asserts resize-before-mode for `NONE`/`HEIGHT`, no-resize for
  `WIDTH_AND_HEIGHT`, no-resize-no-mode for `TRUNCATE`, `maxLines` gated on `ENDING`).

### Integration (dev-only, real runtime) — **Run LS-4 snapshot check**

Dev-gated UI button; mutation under test is a self-contained dev transform (append `' ≋≋≋'` to
`characters`) so acceptance does not depend on LS-10. Runs against the open
`snapshot-restore.fig` and reports per-label pass/fail in the UI. Asserts:

- [ ] Apply then `restoreAll` leaves every eligible node **property-complete** against its
      pre-mutation LS-3 re-scan (field-by-field diff of `TextNodeModel` projections).
- [ ] Every blocked node appears in `BatchResult.blocked` with the correct reason and its
      re-scan is unchanged after apply, before restore.
- [ ] Injected failure on the 3rd node of a batch → zero nodes mutated after the call returns.
- [ ] Hard-close simulation: apply, reload the plugin without reverting → restore-on-launch
      reads the manifest and restores every node property-complete.
- [ ] A node deleted between capture and restore → `NODE_GONE`, dropped from the manifest, no
      throw.
- [ ] After a batch apply, a single user Cmd-Z reverts that batch as one step
      (`commitUndo` checkpointing observed manually).

### Run

- Pure: `npm test`
- Integration: `npm run dev` → open `fixtures/snapshot-restore.fig` → dev-only **Run LS-4
  snapshot check** button. **Blocked by FIX-1**; the pure tests are not.

### Precision fix (issue SC3 — proposed)

Issue SC3 — *"Closing the plugin mid-apply restores the canvas"* — names the wrong mechanism as
the guarantee: the close handler is best-effort and does not fire on every teardown path
(guidelines §2). Tighten to:

> A hard close mid-apply is recovered: on the next plugin launch, restore-on-launch reads the
> mutation manifest and restores every recorded node property-complete; the close handler is a
> best-effort synchronous fast path only.

Precision fix, not a re-scope — it states the mechanism this spec (and the API's actual
lifecycle) can guarantee. Apply to LS-4 SC3 in Linear.

---

## 4. API pins

Baseline pins — close-handler lifecycle, missing-font guard, fonts/`figma.mixed`,
`textAutoResize`/`textTruncation`/`maxLines`, `resizeWithoutConstraints` mode-reset gotcha,
dynamic-page `getNodeByIdAsync`, `setPluginData` 100 kB cap, `clientStorage` semantics — live in
**agent-guidelines §2**; referenced, not repeated. Two surfaces this spec relies on were verified
live and should be **folded upstream into agent-guidelines §2** (LS-3 precedent):

- **`figma.commitUndo()` / `figma.triggerUndo()`** — by default, plugin actions are *not*
  committed to undo history as discrete steps; `commitUndo()` commits the actions so far as a
  checkpoint (a subsequent user undo reverts only what came after), and `triggerUndo()`
  programmatically triggers an undo. This spec uses `commitUndo` at batch boundaries and never
  `triggerUndo`. <https://www.figma.com/plugin-docs/api/properties/figma-commitundo/>
- **Resize floor** — `resize` / `resizeWithoutConstraints` require width and height ≥ 0.01;
  Figma floors live node dimensions at the same bound, so snapshot-captured dims are always
  legal. <https://www.figma.com/plugin-docs/api/properties/nodes-resizewithoutconstraints/>
