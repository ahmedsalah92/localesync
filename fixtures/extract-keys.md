# `fixtures/extract-keys.fig` — authoring checklist (LS-9)

Bootstrapped by `src/main/devtools/generateExtractKeys.ts` (dev-only **Generate extract-keys**
button), then finished by hand. The generator builds 13 of the 14 rows below and reads every text
node back against its own copy of this table; anything it cannot build or could not confirm comes
back in the console as a manual step. **Source of truth for expected values: `docs/specs/LS-9.md`
§2 and §3.3** — the table below restates the shapes with authoring steps only; if the two ever
disagree, the spec wins. The expected keys are hand-derived from the spec's rules and pinned in
`src/main/extract/check.ts` (`EXPECTED`); changing a row's shape here means updating it in both the
generator (`EXPECTED_TEXT` and the build) and the check.

The twelve derivation cases of spec §3.2 are **not** canvas rows — `fixtures/extract-cases.json`
covers them under `npm test`. This file exists for what Vitest cannot prove: persistence,
ownership, eligibility and undo grouping.

**Its own file, never `kitchen-sink.fig`.** The harness writes `localesync:key:v1` plugin data on
every text node it scans; stamping the shared traversal fixture would leave keys on nodes the LS-3
and LS-4 harnesses re-scan. The main-side check refuses to run without the `collision-pair` row,
which `kitchen-sink.fig` does not carry.

Verified by: `npm run dev` → open this file → dev-only **Run LS-9 extract check** button → console.
Every `ls9:…:PASS`, no `FAIL`; the `INFO` probe lines are recorded into `docs/agent-guidelines.md`
§2 per LS-9 §3.4.

---

## Generate

1. `npm run dev`, open a fresh empty file (the generator renames an empty page to `extract-keys`).
2. Dev harness → **Generate extract-keys**. It refuses if an `extract-keys` node already exists on
   the page, rather than building a second half-copy — delete it first to regenerate.
3. Read the console: `created` lists every text node built, `manual steps remaining` lists what is
   left. A `FIX BEFORE SAVING` line means the read-back found a row that disagrees with this table.
4. Do the manual steps below, then save.

## File conventions

- One page, named `extract-keys`.
- **Every row lives inside one group named `extract-keys` — a group, never a frame.** Inside it,
  one frame per row, named exactly as the row label. The harness assigns each text node to a row by
  its *outermost frame* ancestor, so the row frame is also the first key segment
  (`collision-pair` → `collision_pair.…`). Groups are not frame-like and contribute neither a row nor
  a segment, which is why the container must stay a group: converted to a frame, it becomes every
  node's row (the `collision-pair` sentinel disappears) and prefixes shallow keys
  (`extract_keys.collision_pair.total`). Row frames themselves must be **frames**, not groups.
- Body font: **Inter Regular**. Characters are free text unless the table says otherwise — keys
  derive from layer *names*, never from characters.
- No stray text outside the row frames; a page-level text node has no row and is ignored by the
  harness but still extracted.
- **The fixture ships with no plugin data.** No row is stamped by hand — not `tiebreak`, not the
  adoption target. The harness clears every stamp, stamps from scratch, and forges the stamps it needs
  at runtime (`long-name`, `page-wide`, `tiebreak`), restoring them in a `finally`. The generator's
  read-back fails a row that carries any plugin data.
- The harness temporarily renames `Summary`, duplicates the `baseline` text node, changes the
  selection, and forges stamps on the `long-name`, `page-wide` and `tiebreak` rows. Each is undone
  in a `finally`, so a failed assertion leaves the file clean. Only killing the plugin mid-run can
  leave a `Summary renamed` frame or a second `Total` under `baseline`; undo those by hand.
- **`page-wide`** runs two *selection* passes: one over the first `Card`, then one over the second.
  The second must mint `…title_2`, because the first `Card`'s key is read page-wide although it is
  out of scope, and the first `Card`'s stamp must come through byte-identical.
- **`tiebreak`** forges two owners of `tiebreak.label`, with the older claim on the node that comes
  *later* in document order: first by smaller `t`, then by a pre-`t` stamp against a `t`-carrying one.
  A document-order tiebreak would pick the wrong node both times.

## Row inventory

| Row frame | Source | Build | Expected key(s) | Proves |
|---|---|---|---|---|
| `baseline` | generated | Frame `Checkout` › frame `Summary` › text **`Total`**. `Summary` must be the only frame of that name on the page. | `baseline.checkout.summary.total` | rules 1–2; rename + duplicate targets |
| `collision-pair` | generated | Two text nodes, both named **`Total`**, directly in the row frame. | `collision_pair.total`, `collision_pair.total_2` | rule 6 |
| `duplicate-value` | generated | Frames `A` and `B`, each holding a text named **`Label`**; both with characters exactly `Save`. | `duplicate_value.a.label`, `duplicate_value.b.label` | marker 26 (`occurrenceCounts` = 2) |
| `non-latin-name` | generated | Text named **`الإجمالي`** (Latin characters — only the name is non-Latin). | `non_latin_name.text` | rule 3 |
| `deep-tree` | generated | Frame `L1` › `L2` › `L3` › text **`Total`** (the row frame makes it 4 deep). | `l1.l2.l3.total` | rule 5 drops the outermost |
| `long-name` | generated | Text named **`A very long descriptive layer name for the total`**. | `long_name.a_very_long_descriptive_layer` | rule 4; the adoption target |
| `component-master` | generated | A **component** `Badge` holding a text **`Label`**, placed in the row frame (the master itself, visible). | `component_master.badge.label` | rule 19 |
| `local-instance` | generated | An **instance** of `Badge`. | recorded, not asserted | probe 1 |
| `library-instance` | **manual** | An instance of a **published-library** component (any text-bearing one). The generator leaves an empty placeholder frame. | recorded, not asserted | probe 2 |
| `locked` | generated | Text named **`Label`**, **locked**. | recorded, not asserted | probes 3 and 7 |
| `page-wide` | generated | Two frames, **both named `Card`**, each holding one text **`Title`**, directly in the row frame. | `page_wide.card.title`, `page_wide.card.title_2` | page-wide claims: a selection pass over one `Card` never mints the key the other owns |
| `tiebreak` | generated | Two text nodes, **both named `Label`**, directly in the row frame. Plain layers — no stamps. | `tiebreak.label`, `tiebreak.label_2` | same-key owners resolve by stamp time, not document order |
| `hidden` | generated | Text named **`Hidden`** with visibility off. | absent | rule 18 |
| `empty` | generated | Text named **`Empty`** with zero characters. | absent | rule 18 |

### `library-instance` — may stay unresolved

Placing an instance of a published-library component needs **library publishing on the plan**, which
the Plugin API cannot do for you. If it is available: publish any text-bearing component from
another file, then place an instance of it in the `library-instance` frame. If it is not, **leave the
frame empty**. The harness then reports `probe-2:INFO library-instance row not present — probe not
run`, and probe 2 stays unresolved in `agent-guidelines.md` §2. That is survivable, not unfinished:
whether Figma accepts or rejects the write, `writeStoredKey` returns `false` on a rejection, the node
is reported in `blocked`, and the code path is identical either way.

## Manual steps the harness cannot do

- **Undo (rule 15, probe 6).** Run the check (it clears and re-stamps), then press Cmd-Z **once**:
  the whole virgin stamp batch should revert as one step. Re-run to confirm the stamps come back.
- **Instance reset (probe 1).** Right-click the `local-instance` instance → *Reset all changes*,
  re-run, and record whether its stamp survived.
- **Cmd-D duplicate (probe 4).** The harness probes `clone()`; duplicate the `baseline` text node
  by hand, re-scan from the Extract tab, and confirm the copy shows `…total_2`. Delete it after.
- **File duplication (probe 5).** Duplicate the file, open the copy, run the check's Extract tab
  scan, and record whether keys come through unchanged (ids preserved) or by adoption (rule 11).

## Done when

- [ ] Generated with no `FIX BEFORE SAVING` lines in the console.
- [ ] `library-instance` either holds a published-library instance, or is left empty with probe 2
      recorded as unresolved (see above).
- [ ] Run LS-9 extract check reports PASS on every `ls9:` line, no FAIL, no SKIP.
- [ ] Probes 1–7 recorded into `docs/agent-guidelines.md` §2 (probe 2 may be "unresolved").
- [ ] Share link recorded, bare, in `fixtures/README.md`.
