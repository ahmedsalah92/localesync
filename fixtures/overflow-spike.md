# `fixtures/overflow-spike.fig` — authoring checklist (LS-7; promoted to LS-8 acceptance)

> **Role update (2026-07-25):** with the LS-7 spike closed 14/14, this fixture is promoted to the
> **LS-8 acceptance fixture** — the `known-overflow` role from LS-17 — since it already carries a
> documented expected verdict per node matching the resolved per-mode rules. Extend it with
> additional real-world rows (clipping parents, denser layouts) when LS-8 starts; no separate
> `known-overflow.fig` is planned.

Human-built in Figma. **Source of truth for expected verdicts: `docs/specs/LS-7.md` §3** (the
validation-fixture table); the table below restates the node inventory with authoring steps only.
If the two ever disagree, the spec wins.

Verified by: `npm run dev` → open this file → dev-only **Run LS-7 overflow spike** button. Results
log to the console (`[ls7] <label>: PASS|FAIL …`). This fixture backs the LS-7 spike's manual
validation protocol only — there is no `npm test` component (research spike, not a testable
module). The spike harness is **throwaway** (LS-7.md §3): it validates the per-mode rules; it is
not the LS-8 implementation.

Most rows are scriptable: dev-only **Generate overflow-spike** button on a fresh empty file/page
builds 13 of the 14 rows and a README frame listing the manual steps. Only `missing-font` must be
authored by hand.

---

## File conventions

- One page, named `overflow-spike`.
- One top-level frame per table row, frame named exactly as the **node label**; the text node
  inside carries the same name (the spike runner matches on text-node names, first-wins). The one
  exception is `hug-page-parent`, whose text node sits directly on the page.
- Parent frames are the constraining bounds from the spec table: **300×100**, text at (20, 20).
- Body font: **Inter Regular 16** (16px makes the runner's hard-coded LONG candidate reliably
  exceed every box; the authored characters themselves don't matter — the runner measures its own
  candidate strings against clones).
- A `README` frame recording: this file's name, the LS-7 spec path, the missing-font family in
  use, whether the truncate rows report `TRUNCATE`, and the date last edited.
- Do not add stray text nodes outside the labelled frames.

## Node inventory + authoring steps

| Node label | How to build it | Expected verdict |
|---|---|---|
| `fixed-fits` | Resizing **Fixed size** (`NONE`), 200×40, in a 300×100 frame. | `fits` |
| `fixed-overflows` | Same as `fixed-fits` (the runner's candidate differs, not the node). | `overflows` |
| `truncate-fits` | Fixed size 200×40 + **Truncate text** on — reports `textAutoResize: TRUNCATE` (see note). | `fits` |
| `truncate-overflows` | Same as `truncate-fits`. | `truncates` |
| `autoheight-fits` | Fixed width 200, resizing **Auto height** (`HEIGHT`), in a 300×100 frame. | `fits` |
| `autoheight-overflows` | Same as `autoheight-fits`. | `overflows` |
| `autoheight-maxlines` | Auto height, width 200; **Truncate text** on → **Max lines: 2**. | `truncates` |
| `autoheight-maxheight` | Auto-layout frame (vertical, fixed 300×100); text child auto-height, width 200, **maxHeight: 50** (auto-layout children only — agent-guidelines §2). | `truncates` |
| `hug-fits` | Resizing **Hug contents** (`WIDTH_AND_HEIGHT`), in a 300×100 frame. | `fits` |
| `hug-overflows` | Same as `hug-fits`. | `overflows` |
| `hug-page-parent` | Hug contents, text node **directly on the page** (no frame). | `fits` (no container) |
| `missing-font` | Unavailable font — procedure in `kitchen-sink.md` §"missing-font". **Manual.** | `unmeasurable` |
| `mixed-font-ok` | One node, ~half the chars a second available font (e.g. Inter Bold). | measurable (not `unmeasurable`) |
| `rotated-fixed` | Fixed size 200×40, transform **rotation: 30°**. | `overflows` |

### Note: the `truncate-*` rows and `TRUNCATE`

`textAutoResize: 'TRUNCATE'` is deprecated for writing but live on read (agent-guidelines §2): a
fixed-size node with truncation enabled *reports* `TRUNCATE`. The generator logs the reported mode
for both rows on generate — confirm it printed `'TRUNCATE'` and record the answer in the README
frame and in LS-7.md §6. If it reports something else, that is itself a spike finding.

### Note: `missing-font` (manual)

`loadFontAsync` fails for unavailable fonts by definition, so this row cannot be scripted. Follow
the `kitchen-sink.md` procedure (author with a font you then make unavailable), name the node
`missing-font`, and record the family in the README frame.

## What the runner asserts (LS-7.md §3 protocol)

- One `PASS`/`FAIL` line per labelled node: prototype `measureOverflow` verdict vs the expected
  column, plus measured bounds and reason.
- For `autoheight-maxlines`: the capped-vs-free height observation (`capped h=… free h=…`) and
  whether the clone inherited `maxLines` — the §3 maxLines live-verification checklist.
- Clone-fidelity probes: a `bounds-sync gap` line would mean `absoluteBoundingBox` does not update
  synchronously after a `characters` write (pin it in agent-guidelines §2 if seen).
- The user's document is never mutated — measurement touches off-canvas clones only, removed in
  `try/finally`.

## Done when

- [x] All buildable rows exist, named exactly per the table, plus the manual `missing-font` row.
      *(Proven by the run: `missing-font` returned `unmeasurable`, so the row is real.)*
- [x] **Run LS-7 overflow spike** reports PASS for every present row — run 3: 14 PASS, 0 FAIL,
      0 SKIP (2026-07-25).
- [ ] README frame filled in (missing-font family; truncate-rows-report-TRUNCATE answer; date).
- [x] Verdicts and observations recorded in `docs/specs/LS-7.md` §6.
- [x] Shared-Figma link recorded in `fixtures/README.md`.
