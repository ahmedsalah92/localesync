# `fixtures/overflow-spike.fig` — authoring checklist (LS-8 acceptance fixture, ex-LS-7 spike)

> **Role update (2026-07-25):** with the LS-7 spike closed 14/14, this fixture is promoted to the
> **LS-8 acceptance fixture** — the `known-overflow` role from LS-17; no separate
> `known-overflow.fig` is planned.
>
> **LS-8 update (2026-08-07):** the throwaway spike harness is deleted; the fixture now backs the
> LS-8 check (`src/main/overflow/check.ts` + `src/ui/overflow-check.ts`). Three rows carry
> **authored characters and new geometry** for the pass-2 end-to-end scan — see "LS-8 pass-2
> authored rows" below. **The live .fig needs a hand-edit pass to match** (three rows).

Human-built in Figma. **Source of truth for expected verdicts: `docs/specs/LS-8.md` §3** (pass-1
and pass-2 tables); the tables below restate the node inventory with authoring steps only. If the
two ever disagree, the spec wins.

Verified by: `npm run dev` → open this file → dev-only **Run LS-8 overflow check** button. Results
log to the console (`[overflow] PASS|FAIL …`): pass 1 measures every labelled row with explicit
candidates (bypassing expansion), pass 2 drives the real `scanOverflow('page', ['de'])` path
through the authored characters plus the `['ja']` refusal probe, pass 3 exercises `select-node`.

Most rows are scriptable: dev-only **Generate overflow-spike** button on a fresh empty file/page
builds 13 of the 14 rows and a README frame listing the manual steps. Only `missing-font` must be
authored by hand. (Regenerating means redoing the manual `missing-font` row — for the LS-8 update,
hand-editing the three changed rows in the live file is less work.)

---

## File conventions

- One page, named `overflow-spike`.
- One top-level frame per table row, frame named exactly as the **node label**; the text node
  inside carries the same name (the check matches on text-node names, first-wins). The one
  exception is `hug-page-parent`, whose text node sits directly on the page.
- Parent frames are the constraining bounds: **300×100**, text at (20, 20) — except `fixed-fits`,
  whose frame is **640×100** (two grid slots) to hold its wide box.
- Body font: **Inter Regular 16** (16px makes the check's hard-coded LONG candidate reliably
  exceed every box). Authored characters matter **only** for the three pass-2 rows below; every
  other row's characters are irrelevant (pass 1 measures its own candidate strings against clones).
- A `README` frame recording: this file's name, the spec path, the missing-font family in use,
  whether the truncate rows report `TRUNCATE`, and the date last edited.
- Do not add stray text nodes outside the labelled frames (the README's `_readme-text` is fine —
  it rides every scan as an ordinary row).

## Node inventory + authoring steps

| Node label | How to build it | Pass-1 verdict (explicit candidate) |
|---|---|---|
| `fixed-fits` | Resizing **Fixed size** (`NONE`), box **600×40**, frame 640×100. Authored characters below. | `fits` |
| `fixed-overflows` | Fixed size, box **cut snug to the word** (author auto-width, then switch to Fixed size ≈ 36×19). Authored characters below. | `overflows` / `exceeds-fixed-box` |
| `truncate-fits` | Fixed size 200×40 + **Truncate text** on — reports `textAutoResize: TRUNCATE` (see note). | `fits` |
| `truncate-overflows` | Same as `truncate-fits`. | `truncates` / `truncated-fixed-box` |
| `autoheight-fits` | Fixed width 200, resizing **Auto height** (`HEIGHT`), in a 300×100 frame. | `fits` |
| `autoheight-overflows` | Same as `autoheight-fits`. | `overflows` / `exceeds-container-height` |
| `autoheight-maxlines` | Auto height, **width 140**; **Truncate text** on → **Max lines: 2**. Authored characters below. | `truncates` / `maxLines-cap` |
| `autoheight-maxheight` | Auto-layout frame (vertical, fixed 300×100); text child auto-height, width 200, **maxHeight: 50** (auto-layout children only — agent-guidelines §2). | `truncates` / `maxHeight-cap` |
| `hug-fits` | Resizing **Hug contents** (`WIDTH_AND_HEIGHT`), in a 300×100 frame. | `fits` |
| `hug-overflows` | Same as `hug-fits`. | `overflows` / `parent-escape` |
| `hug-page-parent` | Hug contents, text node **directly on the page** (no frame). | `fits` / `no-container` |
| `missing-font` | Unavailable font — procedure in `kitchen-sink.md` §"missing-font". **Manual.** | `unmeasurable` / `missing-font` |
| `mixed-font-ok` | One node, ~half the chars a second available font (e.g. Inter Bold). | measurable (not `unmeasurable`) |
| `rotated-fixed` | Fixed size 200×40, transform **rotation: 30°**. | `overflows` / `exceeds-fixed-box` |

## LS-8 pass-2 authored rows (hand-edit the live .fig)

Pass 2 re-measures these rows through the real path — `scanOverflow('page', ['de'])` — using each
node's **authored** characters, exercising the banded expansion model, the message wiring, and the
verdict projection together. Hand-edits to the live file:

| Node label | Authored characters | Len | de ratio | Candidate | Geometry edit | Expected |
|---|---|---|---|---|---|---|
| `fixed-fits` | `Your changes have been saved automatically.` | 43 | 1.575 | 68 chars ≈ 530 px | Box **600×40**; widen frame to 640 | `fits` |
| `fixed-overflows` | `Save` | 4 | 2.725 | 11 chars ≈ 86 px | Box **snug to the word**: set resizing to Hug (snaps ≈ 36×19), then back to Fixed size | `overflows` / `exceeds-fixed-box` |
| `autoheight-maxlines` | `Continue to checkout` | 20 | 2.035 | 41 chars ≈ 320 px | **Narrow width 200 → 140** (keep Max lines 2, truncation on) | `truncates` / `maxLines-cap` |

- Ratios are the exact values (`1 + bandGrowth × 1.15`); the spec's §3 table shows them
  display-rounded (2.73 / 1.90 — the latter also omits the de factor).
- Geometry is load-bearing, not cosmetic: at the old 200×40, `fixed-fits` would **overflow** (the
  68-char candidate measures ≈ 530 px unlocked) and `fixed-overflows` would **fit** (86 px in a
  200-px box). `fixed-overflows` is the launch-narrative row — a four-letter English button that
  breaks in German — and the regression test for the flat-1.35 model defect: under the old flat
  ratio it returned `fits`. It must stay in the short band.
- At width 200, `autoheight-maxlines`'s 41-char candidate wraps into exactly the 2 permitted lines
  (capped == free ⇒ `fits`); at 140 free growth needs 3 lines, so `maxLines-cap` fires. The
  authored label itself still lays out in 2 lines at 140.
- Pixel widths are estimates from the LS-7 run's ≈ 7.8 px/char at Inter Regular 16 — if a row
  misbehaves on the live run, nudge the box/width and re-run; the check output shows the measured
  numbers.

Pass 2 additionally asserts the refusal path — `scanOverflow('page', ['ja'])` returns every
eligible row as `unmeasurable` / `unsupported-language` with no clone created — and pass 3 asserts
`select-node` (selection lands on the first `overflows` row; a fabricated id yields `node-gone`).

### Note: the `truncate-*` rows and `TRUNCATE`

`textAutoResize: 'TRUNCATE'` is deprecated for writing but live on read (agent-guidelines §2): a
fixed-size node with truncation enabled *reports* `TRUNCATE`. The generator logs the reported mode
for both rows on generate; the LS-8 engine treats `TRUNCATE` as `NONE` + `textTruncation: ENDING`
internally, so the eventual removal from reads is a no-op.

### Note: `missing-font` (manual)

`loadFontAsync` fails for unavailable fonts by definition, so this row cannot be scripted. Follow
the `kitchen-sink.md` procedure (author with a font you then make unavailable), name the node
`missing-font`, and record the family in the README frame.

## What the check asserts (LS-8.md §3)

- **Pass 1** (main side, streamed as `ls8:` progress notes): one `PASS`/`FAIL` line per labelled
  node — verdict **and** reason vs the pass-1 column, explicit SHORT/LONG candidates, expansion
  bypassed so a wrong ratio cannot masquerade as a wrong rule.
- **Pass 2** (UI side): the three authored rows through a genuine `overflow-scan-request` round
  trip, matched by their authored characters, plus the self-sufficiency fields
  (`characters`/`containerLabel`/`candidate`/measured dims) and the `['ja']` refusal probe.
- **Pass 3**: `select-node` selection assertion (main side) and the fabricated-id → `node-gone`
  correlated error (UI side).
- The user's document is never mutated — measurement touches off-canvas clones only, removed in
  `try/finally`.

## Done when (LS-8 promotion pass)

- [ ] The three pass-2 rows hand-edited in the live .fig (characters + geometry per the table).
- [ ] **Run LS-8 overflow check**: pass 1 14/14 (verdict + reason), pass 2 3/3 + ja refusal,
      pass 3 selection PASS + `node-gone`.
- [ ] README frame updated (authored-rows note; date).
- [x] Shared-Figma link recorded in `fixtures/README.md` (unchanged from LS-7).

## LS-7 spike history

The spike harness (`src/main/devtools/overflowSpike.ts`) was throwaway by construction and is
deleted; its run record lives in `docs/specs/LS-7.md` §6 (run 3: 14 PASS, 0 FAIL, 0 SKIP,
2026-07-25). The generator (`generateOverflowSpike.ts`) stays and now authors the pass-2
characters/geometry, so a regenerated fixture matches this checklist.
