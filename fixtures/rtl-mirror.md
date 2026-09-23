# `rtl-mirror.fig` — authoring notes (LS-11 §3.4)

Built by the dev-only **Generate rtl-mirror** button (`src/main/devtools/generateRtlMirror.ts`).
Run it in a **fresh empty file or page** — it refuses a non-empty page rather than appending to
someone's work. Then complete the one manual step below and save.

Acceptance runs against it with **Run LS-11 RTL check** (`src/main/rtl/check.ts`).

## What each row is for

Every row exercises a specific rule or hazard from `docs/rtl-mirroring-ruleset.md`. None of them is
decorative, and a row that looks pointless is usually the one guarding a defect that is invisible
everywhere else.

| Row | Rule | Why it exists |
|---|---|---|
| `h-autolayout` | F1, F3, F5 | The ordinary case: asymmetric padding, `MIN` alignment, three children to reverse |
| `v-autolayout` | F4 | **The axis trap.** Here the horizontal axis is the *counter* axis. A mirror that flips `primary` on this frame reorders it **vertically** |
| `nested-outer` / `nested-inner` | E1 | Each frame mirrors in its own coordinate space; the transform must not compound |
| `wrap-row` | E4 | `layoutWrap: 'WRAP'` — reversing children reverses the sequence *within* the reflow, so row breaks land elsewhere |
| `grid-span` | **F9** | The spanning child in a 3-column grid. `setGridChildPosition` **throws on transient overlap**, so any non-identity permutation collides if written one child at a time |
| `grid-autoflow` | F9 guard | A `ROW_AUTO_FLOW` grid places children by layer order and **`setGridChildPosition` throws on it**. The mirror must skip F9 here and the snapshot must not capture positions, or restore throws on every launch. Passes if apply and revert both complete. Its columns are **not** mirrored — a known gap, see LS-11 §2.12 |
| `absolute-badge` | F7, F8 | The only row where `x` is *authored* rather than derived. Its constraint is `MAX`, so F8 must flip too or it drifts on the next resize |
| `overlap-stack` | **F2** | Negative `itemSpacing` makes the avatars overlap, so reversing the array without toggling `itemReverseZIndex` visibly re-stacks them. Invisible on any non-overlapping row |
| `plain-group` | §7.4 | A `GROUP` has no layout properties; its children mirror about the group's own bounds |
| `rtl-instance` | §2.5 | Instance children **cannot be reparented**, so F1 is impossible. Padding and alignment must still mirror, and the instance must be flagged as partial |
| `locked-row` | §2.6 | `locked` must **not** block the mirror — it is a canvas affordance, and the API writes through it. Proves the correction to ruleset G4 rather than assuming it |
| `mixed-bidi` | E3, G3 | A text node with both LTR and RTL runs. The mirror must **not** touch the text, only flag it |
| `missing-font` | CLAUDE.md hard rule | **Manual — see below.** The only row proving the missing-font rule on the *layout* path |

## The one manual step

`loadFontAsync` fails for unavailable fonts by definition, so a missing-font row cannot be scripted —
the same limitation `overflow-spike.md` and `snapshot-restore.md` record for their own rows.

Add a text layer in a font this machine does not have (copy one in from another file, or uninstall
the font), name it `missing-font`, and put it inside a horizontal auto-layout frame so the mirror
would otherwise want to change its `textAlignHorizontal`.

**Expected:** the mirror skips it and reports it as `blocked` with reason `missing-font`. The check
prints `ls11:blocked-untouched:PASS` and `ls11:missing-font-align:PASS`. The row's `x` may move — its
parent is mirrored and re-lays it out — but its alignment must not change.

## What a good run looks like

`Run LS-11 RTL check` prints `ls11:` lines to the main-thread console. The ones that matter:

- `ls11:mirror-twice-identity:PASS` — every rule is its own inverse, which is what makes revert
  reliable and recursion order free (LS-11 §2.3). Re-plans from the **mirrored** state and predicts
  the baseline rather than comparing a plan to itself.
- `ls11:revert-byte-identical:PASS` — the success criterion. Every captured property *and* the full
  child order back to baseline.
- `ls11:no-compounding:PASS` — a second apply mirrors from source, not from the mirrored state.
- `ls11:one-undo-step:PASS apply=1 revert=1` — plus the `MANUAL` line: confirm once by hand that a
  single Cmd-Z reverts the whole mirror.
  Confirmed 2026-09-23 (LS-11 §2.8).

A `SKIP` is not a pass. `ls11:instance-locked:SKIP` on this fixture means the instance row did not
build, not that the rule is satisfied.
