# `fixtures/kitchen-sink.fig` — authoring checklist (FIX-1 / LS-17)

Human-built in Figma, bootstrapped by `src/main/devtools/generateKitchenSink.ts` (dev-only).
**Source of truth for expected values: `docs/specs/LS-3.md` §3** — the table below restates the
node inventory with authoring steps only; if the two ever disagree, the spec wins.

Verified by: `npm run dev` → open this file → dev-only **`__test:traversal`** button. All 17
labelled rows plus the `selection-scope` and `no-selection` assertions must report PASS
(21 main-side checks total).

---

## File conventions

- One page, named `kitchen-sink`.
- One top-level frame per table row, frame named exactly as the **node label**; the text node
  inside carries the same name (the harness matches on text-node names).
- Body font for all non-font-test rows: **Inter Regular**.
- A `README` frame at the top-left recording: this file's name, the LS-3 spec path, the
  missing-font family in use, and the date last edited.
- A frame named **`selection-scope`** containing ≥2 text nodes — required by the harness's
  selection-scope assertion, not itself a golden row.
- The generator also leaves a hidden `_masters` frame holding the component masters for rows 10–11.
  Leave it; the harness matches by label, not by page count.
- Do not add stray text nodes outside the labelled frames.

## Node inventory + authoring steps

| # | Node label | How to build it |
|---|---|---|
| 1 | `auto-width` | Text node, resizing **Hug contents** (width and height). |
| 2 | `auto-height` | Text node, fixed width, resizing **Auto height**. Enough text to wrap ≥2 lines. |
| 3 | `fixed` | Text node, resizing **Fixed size**. |
| 4 | `truncating` | **Fixed size**; type settings → **Truncate text** on. Type ≥4 lines so truncation is visibly active. **No Max lines** — see the truncation note below. |
| 5 | `truncating-maxlines` | **Auto height**, fixed width; type settings → **Truncate text** on → **Max lines: 2**. Text visibly collapses to 2 lines with an ellipsis. |
| 6 | `autolayout-maxheight` | Auto-layout frame; text node as a **direct child**, resizing **Auto height**, height dropdown → **Add max height: 80**. |
| 7 | `mixed-font` | One text node; switch roughly half the characters to a second font (e.g. Inter Bold). The font field must read mixed. |
| 8 | `missing-font` | See procedure below. |
| 9 | `empty` | Text node with zero characters (type a char, delete it, click away — the layer persists with `""`). |
| 10 | `nested-instance` | Component **A** = frame + text node. Component **B** = frame containing an *instance of A*. Place an **instance of B** in the labelled frame → text 2 instance levels deep. |
| 11 | `component-override` | Instance of a text-bearing component; override the characters to exactly `component-override`. |
| 12 | `in-group` | Text node inside a plain **Group**. Second variant `in-group-boolean`: text + shape → **Boolean union**. |
| 13 | `zero-size` | Build at **0.01 × 0.01** — see note below. |
| 14 | `rotated` | Text node, transform **rotation: 30°**. |
| 15 | `hidden-self` | Text node with its own visibility off. |
| 16 | `hidden-ancestor` | Visible text node inside a frame whose visibility is off. |
| 17 | `locked-ancestor` | Unlocked text node inside a **locked** frame. |

### Note: the two truncation rows (4 and 5)

These exercise Figma's **two distinct truncation triggers**, both of which LS-7 must produce a
verdict for. They are not redundant.

- **Row 4 — box-clip truncation.** Fixed size, truncation on. Content is hidden because the box
  is smaller than the text. `maxLines` is **not involved and cannot be set**: Figma exposes the
  Max lines field only when truncation is enabled *and* resizing is auto-height or auto-width
  (or hug, for text in auto-layout frames). On a fixed-size node the field is absent and an API
  write of `maxLines` is silently rejected.
- **Row 4 reports `textAutoResize: "TRUNCATE"`** — the deprecated enum value, live-observed on
  current Figma, not a legacy-file artifact. The golden expects `TRUNCATE`; do not "correct" it
  to `NONE`. Never *write* this value.
- **Row 5 — max-lines truncation.** Auto height + truncation + `maxLines: 2`. The box would grow;
  the line cap is what stops it.

### Procedure: `missing-font` (row 8)

Currently built with **Quadrillion** (a commercial family, recorded in the README frame).

1. Install an uncommon **local** font — one that is not in Google Fonts, since Figma bundles the
   Google catalogue and serves those natively regardless of what's installed locally.
2. Apply it to the row-8 text node. Save.
3. Quit Figma fully, uninstall the font, relaunch, reopen the file.
4. Confirm the yellow **`A?`** badge beside the font name and that the family returns no match in
   the font picker. Do **not** click the badge — that opens replace-font and clears the state.

⚠️ **Machine-dependent.** Anyone with that family installed sees the node resolve normally and
this row silently passes as a false negative. If Figma still serves the font after uninstalling,
its font agent has cached it: quit Figma, `rm -rf "$HOME/Library/Application Support/Figma"`,
relaunch.

**Robust alternative** (removes the machine-dependence, recommended if this fixture is ever
shared): mint a family name no catalogue can resolve, using `fonttools` to rewrite nameIDs 1, 4
and 6 of any font you own to `LocaleSyncMissing`. Install, apply, save, uninstall, clear the
agent cache. Nothing can resolve that family, so `hasMissingFont` stays true everywhere.

### Note: `zero-size` (row 13)

Figma floors width/height at **0.01 px**; an exact 0 is not authorable, and the stored float32
lands marginally under (`0.009999999776482582`). The harness compares `<= 0.01`. Do not tighten
that back to `=== 0` — the row would become permanently red.

## Done when

- [ ] All 17 labelled nodes exist, named exactly per the table, plus the `selection-scope` frame.
- [ ] `__test:traversal` reports 21 PASS, no FAIL, no SKIP on the main-side checks.
- [ ] README frame filled in (incl. the missing-font family name).
- [ ] File saved to `fixtures/` (or shared-Figma link recorded in `fixtures/README.md`).
