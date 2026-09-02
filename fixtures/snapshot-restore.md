# `fixtures/snapshot-restore.fig` — authoring checklist (FIX-1)

Human-built in Figma. **Source of truth for expected values: `docs/specs/LS-4.md` §3** (the
"Fixture" build sheet); the table below restates the node inventory with authoring steps only. If
the two ever disagree, the spec wins.

Verified by: `npm run dev` → open this file → dev-only **Run LS-4 snapshot check** button. Results
stream to the browser console (`[snapshot] PASS|FAIL …`). This fixture is BLOCKED work for the LS-4
integration acceptance; the LS-4 pure unit tests (`npm test`) do not need it.

---

## File conventions

- One page, named `snapshot-restore`.
- One top-level frame per table row, frame named exactly as the **node label**; the text node
  inside carries the same name (the harness matches on text-node names, first-wins).
- Body font for all non-font-test rows: **Inter Regular**.
- A `README` frame recording: this file's name, the LS-4 spec path, the missing-font family in use,
  and the date last edited.
- **Sentinel:** the harness only runs its (mutating) apply→restore cycle when a node labelled
  **`instance-child`** is present — a label the kitchen-sink fixture does not carry, so the snapshot
  check can never fire against kitchen-sink.fig. This label is **required**; without it the harness
  reports `fixture-missing` and does nothing.
- Do not add stray text nodes outside the labelled frames.

## Node inventory + authoring steps

The op under test is a self-contained dev transform (append `' ≋≋≋'` to `characters`), standing in
for LS-10 pseudo-loc. Eligibility below is for that char-writing op (`pseudoloc`).

| Node label | How to build it | Harness expectation |
|---|---|---|
| `auto-width` | Text node, resizing **Hug contents** (`WIDTH_AND_HEIGHT`). | applied → restored property-complete |
| `auto-height` | Fixed width, resizing **Auto height** (`HEIGHT`); ≥2 lines of text. | applied → restored property-complete |
| `fixed` | Resizing **Fixed size** (`NONE`). | applied → restored property-complete |
| `truncating` | **Auto height**, fixed width; **Truncate text** on → **Max lines: 2** (see note). | applied → restored incl. truncation + `maxLines` |
| `legacy-truncate` | `textAutoResize: TRUNCATE` — authorable **only from a legacy file** (see note). | restored; mode untouched. **Skip if unobtainable** and note it here. |
| `missing-font` | Unavailable font — procedure in `kitchen-sink.md` §"missing-font". | **blocked** `missing-font`; never touched |
| `mixed-font` | One node, ~half the chars a second font (e.g. Inter Bold); font field reads mixed. | **blocked** `mixed-font-char-mutation` (char op) |
| `instance-child` | Text **inside an instance** (component with a text child → place an instance). **Required sentinel.** | applied → restored (characters overridable) |
| `empty` | Text node with zero characters. | **blocked** `empty`; never touched |
| `rotated` | Text node, transform **rotation: 30°**. | applied → restored incl. `x`/`y` |
| `zero-size` | Build at **0.01 × 0.01** (see note). | applied → restored (dims floored at 0.01) |

### Note: `truncating` and the `maxLines` requirement

The LS-4 §3 build sheet lists `truncating` as `NONE` + `textTruncation: ENDING` + `maxLines: 2`.
Those are **not co-authorable**: Figma exposes Max lines only when resizing is auto-height/auto-width
(agent-guidelines §2), and a fixed-size (`NONE`) node with truncation on reports
`textAutoResize: "TRUNCATE"` with `maxLines` stuck at `null` — that case is already covered by the
`legacy`-style path and by the `legacy-truncate` row. To actually exercise **`maxLines` restore**,
build this row as **Auto height** (as above). The harness is agnostic either way — it captures the
node's real pre-mutation state and asserts the restore matches it — so a `NONE`-authored node still
passes (its `maxLines` is `null` both before and after). Flag which you chose in the README frame.

### Note: `legacy-truncate` (skippable)

`textAutoResize: TRUNCATE` cannot be *written* via the API. Obtaining a node that *reports* it other
than the fixed-size-truncation path (the `truncating`/kitchen-sink row 4 case) requires an older
`.fig`. If you can't source one, **skip this row** and record the omission here — the primitive's
TRUNCATE handling is already proven by the `planRestore` unit test (`no resize, no mode write`).

### Note: `zero-size`

Figma floors width/height at **0.01 px**; an exact 0 is not authorable, and the stored float32 lands
marginally under (`0.009999999776482582`). The harness compares dims with a `<= 0.01` tolerance and
asserts against the pre-mutation re-scan, not the authored values. Do not expect an exact `0`.

## What the harness asserts (LS-4 §3 Integration)

- Apply then `restoreAll` leaves every eligible node **property-complete** vs its pre-mutation probe.
- Every blocked node appears in `BatchResult.blocked` with the correct reason and is **unchanged**
  after apply.
- Injected failure on the 3rd node of a batch → **zero** nodes left mutated, manifest left clean.
- Restore runs via `restoreAll` (reads the durable `clientStorage` manifest + `pluginData`, not the
  in-memory refs) — i.e. exactly the **restore-on-launch / hard-close recovery** path.
- A throwaway node deleted between capture and restore → `NODE_GONE`, dropped, no throw.
- `undo`: **manual** — apply a batch, press Cmd-Z once; the whole batch reverts as one step.

## Done when

- [x] All buildable rows exist, named exactly per the table, including the **`instance-child`** sentinel.
      *(Verified 2026-09-02 via Figma metadata inspection of the live file — all 11 row labels are
      present, including the required `instance-child` sentinel and `legacy-truncate` (not
      skipped). Deep properties — actual `textAutoResize`/`maxLines` values, missing/mixed-font
      resolution — aren't visible to metadata inspection; only the running harness can confirm those.)*
- [ ] **Run LS-4 snapshot check** reports PASS for every present row, no FAIL (SKIP allowed for
      `legacy-truncate` and for `injected-failure` if <3 eligible nodes).
      *(Needs an interactive `npm run dev` session inside Figma desktop — not run from here.)*
- [ ] README frame filled in (missing-font family; how `truncating` was authored).
      *(Text content isn't exposed by metadata inspection — needs a manual check in-file.)*
- [x] File saved to `fixtures/` (or shared-Figma link recorded in `fixtures/README.md`).
      *(Link present in `fixtures/README.md`.)*
