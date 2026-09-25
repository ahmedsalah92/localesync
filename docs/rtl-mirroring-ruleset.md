# RTL mirroring ruleset (RTL-1 / LS-20)

**Status: settled.** Drafted against published guidance and the verified Figma API, then reviewed
by Ahmed — the four judgement calls are recorded as resolved in §7. LS-11's spec derives from this.

This ruleset is the input to `docs/specs/LS-11.md`. It says **what flips, what never flips, and what
the plugin refuses to decide** — not how to implement it.

Every Figma property named here was verified against `@figma/plugin-typings/plugin-api.d.ts` in this
repo, not from memory (CLAUDE.md: never invent Figma API). Line references are to that file.

## 0. Scope — this is a stress test, not a translation

LocaleSync's RTL feature mirrors **layout geometry** so a designer can see what breaks. It is
explicitly *"a **structural** mirror (anatomy flipped), not a text-content change, since RTL
mirroring is a layout stress-test rather than a translation"* (`docs/design.md`, LS-24 Deliverable 4).

Three consequences that shape everything below:

1. **We never reshape text.** Figma has rendered bidi text natively since 2022. Character ordering,
   shaping and neutral-run resolution are the renderer's job.
2. **We never mirror artwork.** No negative scale, no flipped vectors — see N1.
3. **The mirror is reverted, not shipped.** It runs through LS-4's snapshot primitive, so every rule
   must be exactly invertible. A rule that loses information is a bug even if it looks right.

Because of (2), the classic "which icons must not be mirrored" guidance does not constrain our
*transform* — it constrains what we **flag**. That is the ruleset's central move, and §3 explains it.

---

## 1. What flips

| # | Rule | Property (verified) | Example |
|---|---|---|---|
| **F1** | Reverse child order in horizontal auto-layout | `layoutMode === 'HORIZONTAL'` (7332) → reverse the `children` array | `[Cancel][Save]` → `[Save][Cancel]` |
| **F2** | Preserve paint order when F1 reverses it | `itemReverseZIndex` (7765) | An overlapping avatar stack keeps the same face on top |
| **F3** | Main-axis alignment, horizontal frames only | `primaryAxisAlignItems` (7532): `MIN`↔`MAX`; `CENTER` and `SPACE_BETWEEN` unchanged | A toolbar pinned left pins right |
| **F4** | Cross-axis alignment, **vertical** frames only | `counterAxisAlignItems` (7614): `MIN`↔`MAX`; `CENTER` and `BASELINE` unchanged | A left-aligned column of labels becomes right-aligned |
| **F5** | Horizontal padding | `paddingLeft` ↔ `paddingRight` (7336) | A list row with 16 left / 8 right inset becomes 8 / 16 |
| **F6** | Text alignment | `textAlignHorizontal` (10553): `LEFT`↔`RIGHT`; `CENTER` and `JUSTIFIED` unchanged | A left-aligned paragraph becomes right-aligned |
| **F7** | Position of children not in an auto-layout flow | `x' = parentWidth − x − width` | An absolutely-positioned badge at the top-right moves to the top-left |
| **F8** | Horizontal constraints | `constraints.horizontal` (`ConstraintType`, 4453): `MIN`↔`MAX`; `CENTER`, `STRETCH`, `SCALE` unchanged | A child pinned to the right edge pins to the left and still tracks on resize |
| **F9** | Grid column position | `setGridChildPosition(row, col)` (8192): `col' = gridColumnCount − 1 − col − (gridColumnSpan − 1)`. **Rows never change.** | A 3-column card grid reverses left-to-right, row order intact |
| **F10** | Grid child horizontal alignment | `gridChildHorizontalAlign` (8239): `MIN`↔`MAX`; `CENTER` and `AUTO` unchanged | A cell's content hugging its left edge hugs the right |

### Notes that are easy to get wrong

**F1/F2 are one rule, not two.** In an auto-layout frame the `children` array drives *both* layout
order and paint order — `children[0]` lays out first and paints behind. Reversing the array to mirror
the layout therefore silently reverses the stacking of any overlapping children. `itemReverseZIndex`
exists precisely to decouple the two, and must be toggled to keep the original z-order. Miss this and
overlapping avatar stacks, chips and badges quietly re-stack.

**F3 vs F4 are axis-dependent, not interchangeable.** The horizontal axis is the *primary* axis in a
horizontal frame and the *counter* axis in a vertical one. A mirror must flip whichever of the two
happens to be horizontal for that frame, and leave the other alone. Flipping both is a common bug
and produces vertically-reordered columns.

**F9's setter throws on transient overlap.** `gridColumnAnchorIndex` is read-only (8210); position is
set via `setGridChildPosition`, and the typings state the setter *"will throw an error"* if the index
*"results in the node overlapping with another node in the grid"*. Mirroring a grid by assigning new
column indices one child at a time will therefore collide mid-sequence. LS-11 must order the writes
to avoid transient overlap (or stage children out of the grid and back). This is the single most
likely place for the implementation to fail on a real file.

---

## 2. What never flips

| # | Rule | Rationale |
|---|---|---|
| **N1** | **Artwork and vector geometry.** No negative scale, no mirrored paths, ever. | A stress test must not invent art the designer never drew. The design file already treats mirroring as an *authoring* act, not a runtime transform: `icon.16.chevron.left (local)` was built by mirroring geometry **once** at author time, explicitly *"not via a runtime instance-level transform"* (`docs/design.md`). Flipping art at runtime would also be unrevertable in any meaningful sense. |
| **N2** | Text content, character order, bidi resolution | Figma renders bidi natively; reshaping would corrupt real content and is not what a layout test is for. |
| **N3** | Images, photographs, logos and brand marks | A mirrored logo is wrong in every locale. |
| **N4** | Media playback controls and media progress | Material Design: these *"refer to the direction of the media being played, not the direction of time"* — the direction of the tape, not of time. |
| **N5** | Clocks, circular refresh and circular progress | Material Design: *"Clocks still turn clockwise for RTL languages."* |
| **N6** | Right-handed physical objects, check marks, keyboards | Material Design: *"Physical keyboards look the same everywhere in the world"*; the search magnifier keeps its handle bottom-right *"because the majority of users are right-handed."* |
| **N7** | Numbers, phone numbers, postcodes, URLs, email addresses, currency symbols | Wikimedia Codex lists each of these as not flipping. |
| **N8** | Charts and graphs | Codex: do not mirror *"if mirroring could impact data interpretation."* |

N3–N8 describe **content that must not end up mirrored**. Since N1 means we never mirror content
anyway, their practical force in LS-11 is on the *flag* path, not the transform path — see §3.

---

## 3. What the plugin refuses to decide, and flags instead

This is the part that makes the feature honest. Mirroring a layout moves a directional icon to the
other side **without rotating it**, so a `>` chevron in a "Next" button ends up on the left still
pointing right. That is not a bug in the mirror — **it is exactly the RTL breakage the designer needs
to see**, and it is not something the plugin can fix without inventing artwork (N1).

| # | Flagged | Why the plugin cannot decide |
|---|---|---|
| **G1** | Any vector/icon child whose position moved under F1 or F7 (and F9's column moves, per decision 2 in §7: "flag every vector whose position moved") | Whether it *should* have rotated depends on what it depicts. The plugin knows geometry, not meaning. |
| **G2** | Nodes whose name suggests N4–N6 (`play`, `pause`, `rewind`, `clock`, `search`, `logo`, `check`…) | A name heuristic is a hint, not a fact. Flag, never act. |
| **G3** | Text nodes containing both RTL and LTR runs | Mixed content is where bidi actually bites, and the correct result is a judgement about the content. |
| **G4** | Locked nodes, and nodes with `hasMissingFont` | CLAUDE.md hard rule: never mutate the content or layout of a missing-font node. Skip and flag, per LS-4's eligibility table. |

Flagged nodes are **reported, not transformed**. This reuses the `blocked[]` channel LS-4 already
provides and the results-row pattern LS-8 already ships, so it needs no new UI concept.

---

## 4. The three edge cases LS-11 named

### E1 — Nested auto-layout

Mirror **recursively, each frame in its own coordinate space**. A horizontal row inside a vertical
column inside a horizontal bar mirrors at each level independently; the transform is not composed and
not applied twice to the same node. F7's `x' = parentWidth − x − width` is always relative to the
*immediate* parent, never to the page.

Invertibility check: mirroring twice must be an identity. Reversing a reversed array restores it, and
`MIN`↔`MAX` is its own inverse, so every F-rule is an involution by construction — with the exception
of F7, which is exact only while `parentWidth` is unchanged. See §5.

### E2 — Absolutely-positioned children

`layoutPositioning === 'ABSOLUTE'` (8145) removes a child from its parent's auto-layout flow, so F1
never sees it. It must be mirrored explicitly by F7, and its `constraints.horizontal` by F8 —
otherwise it lands correctly and then drifts the moment the frame resizes.

Order matters: mirror absolutely-positioned children **after** the parent's auto-layout has settled,
so `parentWidth` in F7 is the final width, not an intermediate one.

### E3 — Mixed LTR/RTL content

**Do nothing to the text** (N2) and flag it (G3). Codex's guidance is about *alignment* consistency —
*"Don't: Mix alignments within paragraphs containing LTR and RTL languages"* — which is a content
decision the designer owns. The mirror's job is to make the layout consequence visible.

### E4 — Two more the issue did not name, found while verifying the API

- **`layoutWrap === 'WRAP'`** (7467): a wrapped horizontal auto-layout reflows into rows. Reversing
  the children array reverses the sequence *within the reflow*, which is correct, but the row breaks
  land in different places. Expected, and worth an acceptance case rather than a rule.
- **`layoutMode === 'GRID'`** (7332): grid auto-layout is newer than this issue and is not a
  horizontal flow. It needs F9/F10 rather than F1, and carries the throw-on-overlap hazard above.
  Without a rule here, a grid would either be silently skipped or corrupted.

---

## 5. Restore, and why exact invertibility is a requirement

RTL mirroring is one of the three canvas-mutating features, so it runs through LS-4:
`withSnapshot(nodes, 'rtl', …)` to apply, `restoreByOp('rtl')` to revert, one `figma.commitUndo()`
per batch. **The user must be able to get their file back byte-identically.**

Two known hazards, both already recorded in `docs/agent-guidelines.md` §2:

- `resize()` re-applies child constraints; `resizeWithoutConstraints()` sets an exact bounding box.
  F8 changes constraints, so any resize between mirror and restore can interact with it.
- Figma floors node dimensions at 0.01 px, so F7's arithmetic must not be assumed to round-trip for
  sub-pixel positions. The snapshot restores stored values rather than re-computing the inverse,
  which sidesteps this — but LS-11 should not rely on "mirror twice" as its restore path.

---

## 6. What this does not cover

- **Which languages are RTL.** Detection and the language list belong to LS-11's spec; this ruleset
  is language-agnostic and applies to any RTL target.
- **Panel controls and copy.** Settled by DES-2 (`docs/design.md`, LS-24 Deliverable 4): a Mirror
  toggle, seven rows with mirrored anatomy, the shared apply/revert pattern.
- **Any Figma API pin.** LS-11's spec should add the auto-layout, constraints and grid properties to
  `docs/agent-guidelines.md` §2 — it currently pins only `resize`/`resizeWithoutConstraints` from
  this surface, which is a real gap for this feature.

---

## 7. Judgement calls — settled 2026-09-14

1. **G1 is flag-only. The plugin never rotates artwork.** Confirmed by Ahmed. The mirror moves a
   directional icon and reports it; it does not generate a rotated version. This keeps N1 absolute,
   keeps restore byte-identical, and treats the backwards-pointing chevron as the finding rather
   than as a defect to hide.
2. **Detection is G1 alone: flag every vector whose position moved.** Confirmed by Ahmed. No layer-
   name matching. G2 stays in §3 as a description of the *categories* that must not end up mirrored
   — useful for LS-11's acceptance cases and for the row copy — but it is **not** an implementation
   rule, because a name heuristic is locale-dependent and guesses at meaning the plugin cannot know.
   G1 already puts every icon worth checking in front of the designer.
3. **Scope is EXPLICIT: a scope select, defaulting to Page.**

   *Corrected 2026-09-20.* This rule previously read "implicit: selection when non-empty, else
   page", justified by the claim that "DES-2's RTL panel carries a Mirror toggle and no scope
   select". **That claim was false.** The built panel (`186:296`) has a `Dropdown` at `538:1437`
   reading "Page", and `docs/design.md` Deliverable 4 says so in as many words: *"Scope select —
   cloned from the same Scope Select pattern as Extract."* The decision was settled from a premise
   about a panel nobody had looked at.

   The design is also right on the merits, which is why the correction changes the code rather than
   just the sentence. Implicit scope is defensible for pseudo-loc, which swaps text; a mirror
   **restructures layout**, and a user who cannot tell what is about to be restructured before
   flipping the switch has no way to scope the blast radius. LS-10's precedent does not transfer.

   *Completed 2026-09-25 (LS-33).* The main thread still fell back from an empty Selection to the
   whole page, which undid this rule. Selection with nothing selected now mirrors nothing and shows
   the design's "Nothing selected" state.
4. **Groups mirror about their own bounding box.** A `GROUP` has no layout properties, so F1/F3–F5
   do not apply and its children are mirrored by F7 relative to the group's bounds. This is the only
   reading consistent with F7 being parent-relative (E1); treating groups as opaque would silently
   skip a very common container.

Items 3 and 4 were settled from existing precedent rather than asked, and are cheap to reverse if
LS-11 finds a reason.

## Sources

- [Material Design — Bidirectionality](https://material.io/archive/guidelines/usability/bidirectionality.html)
  ([mirror](https://github.com/albatrosary/material-design-jp/blob/master/Usability/Bidirectionality.md))
  — the mirror/no-mirror icon categories, media-playback and clock rules.
- [Wikimedia Codex — Bidirectionality](https://doc.wikimedia.org/codex/v1.9.0/style-guide/bidirectionality.html)
  — the non-flipping content list (numbers, URLs, currency, charts) and mixed-alignment guidance.
- [Apple HIG — Right to Left](https://developer.apple.com/design/human-interface-guidelines/right-to-left)
  — general principle that controls and navigation reverse while content orientation is preserved.
- `node_modules/@figma/plugin-typings/plugin-api.d.ts` — every property and signature above.
