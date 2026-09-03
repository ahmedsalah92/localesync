# LocaleSync — Design (design.md) v3.2

*The UI/UX design state of the **plugin** — what exists, what's left, and the concrete mocks to produce. Scope is the plugin's product surface only. Brand identity, marketing, and validation design are complete and live outside this doc.*

> **v3.2 (2026-09-03) — canvas reconciliation.** Six divergences found by reading the canvas during LS-5 spec prep. Corrected: control bar 43px → 40px; severity vocabulary `clips` → `truncates`, matching `OverflowVerdictValue`, which carries no `'clips'`; Results Row, Extract Row and Applied Banner type corrected from Inter 12 to the 11px `body/body.medium` ramp. Recorded as built: the four LS-13 Pro stubs, the Applied Banner's `Restored` variant, and the seventh shell state (`Operation failed`). Component-set inventory corrected to four sets. Also corrected: the jump affordance is `icon.16.arrow`, not `icon.24.select`, and its rationale is replaced rather than re-keyed — the target metaphor was explicitly rejected on canvas (`301:1549`, 2026-08-21) because concentric circles read as a selected radio button inside a row that already carries a `Selected` state. **No design decision changed** — this pass records what is on canvas and repairs stale transcription.
>
> **v3.1 (2026-09-01) — canonical-source pass.** `docs/design.md` in the repo is now the **single source of truth** for the plugin design; the Figma file is the artifact, this doc is the record. Four corrections verified against the canvas: summary bar 36px → **40px** (padding 6 → 8, both off the `Spacers` scale); the resize affordance corrected from a nonexistent "native corner cursor" to **edge-drag** with the scrollbar-clearance rule; the LS-15 threshold revised from a provisional `2,000` to an **advisory `500`** pending benchmark, expressed as a time budget; and the v3 shell-count caveat closed — **nine shells confirmed**, all `400×720`.
>
> **v3 (2026-08-09) — consistency pass.** No design content changed. Version bumped from v2; the deliverables summary corrected (it still said the panel controls were open and blocking LS-8, contradicting the body); LS-14 restated as wiring-only in both places it appeared as illustration replacement; completed sections moved out of *To be done*; shell count normalised to 9 (*confirmed on canvas 2026-09-01* — the doc previously said 7, 8 and 9 in different places); the no-hex-literals claim reconciled with the mirrored `Tooltip`; and the three items awaiting Ahmed consolidated under *Open design decisions*.

---

## Canvas inventory — `🧩 Plugin — Phase 1`

*Verified against the file 2026-08-08. Page root `196:222`.*

**15 sections:** Page Header · Plugin Header · Results Row · Applied Banner · Populated Shell · Empty State · Applied Pattern · Extract Row · Populated Extract Shell · Empty State Extract Shell · All Nodes Shell · Scanning Shell · DES-1 State Matrix · Dropdown Menus · Jump Affordance

**9 standalone shells**, all `400×720`, none stroked, all carrying the Control Bar except the three Applied shells:

| Shell | Purpose |
|---|---|
| Plugin Shell | Populated overflow list, 24 rows, `Show: issues` |
| Plugin Shell — All Nodes | `Show: all`, 32 rows, 8 Fits interleaved |
| Plugin Shell — Empty State | `No issues found` |
| Plugin Shell — Scanning | In-flight, Stop + progress + partial results |
| Plugin Shell — Extract | Extract populated |
| Plugin Shell — Extract Empty | Extract first-run |
| Plugin Shell — Preview / Pseudo-loc / RTL Mirror Applied | Apply/revert pattern ×3 |

**4 component sets:** `Results Row` (8 variants, `184:96`) · `Extract Row` (2, `199:244`) · `Applied Banner` (2, `321:1613`) · `Plugin Shell — States` (7, `289:1420`)

---

## Design principles (the few that govern decisions here)

- **Plugin chrome is UI3. Brand identity is separate.** The plugin surface is built on **UI3 — Figma's official design language, published as a Community library**. Colors, controls, typography, icons, badges, toasts, density — whatever UI3 provides. **If it's drivable from UI3, it comes from UI3.** Full stop. The Clipped Bar brand — marigold, charcoal, Space Grotesk — lives on the logo, marketing site, and brand assets. Not the plugin chrome. This is a firm architectural decision, not a style preference and not negotiable.
- **No custom icons, ever. UI3 icon components or nothing.** Not hand-drawn vectors, and not typographic glyphs standing in for icons (`▾`, `›`, `✕`) — a glyph is a custom icon wearing a font. Every icon on the plugin surface is an instance of a published UI3 icon component with its vector fills bound to an `icon/*` token. **If UI3 has no icon for the job, the answer is no icon** — not a near-miss borrowed from elsewhere in the kit. Misapplied semantics cost more than absence.
- **No borders on the shell.** The plugin window carries no outline. Figma already frames the iframe; an added border reads as a second, competing edge. Strokes on the plugin surface are reserved for *dividers* (`border/default`) and *state* (`border/selected-strong`) — never for containment.
- **Polish is part of the moat.** Per the v3.4 brief, design polish + integration is one of four moat components. The differentiation against Gleef and the fragmented free QA tools is partly that this feels like *one coherent, considered tool*. Functional-but-unconsidered is exactly what the competitors already are.
- **The overflow surface carries the product.** It's the hero; its legibility at a glance is where the value lands or doesn't. It gets the most design attention.
- **Non-destructive must be legible.** Three features mutate the live canvas (preview, pseudo-loc, RTL mirror). The user must always know whether they're in an applied state and how to get back. Variant switching must re-apply over the same snapshot, not stack mutations. Revert must always return to true source. This is the design job that prevents the scariest support failure ("the plugin wrecked my file").

---

## UI3 token vocabulary

*Every UI3 semantic token used across the plugin surface, with its role. Bindings are stable — the underlying library value can change without any plugin-side updates.*

**Library setup** — UI3 is imported into the LocaleSync Figma file as a Community library. Three collections, imported programmatically via `figma.variables.importVariableByKeyAsync(key)`:

- Colors: `9b0def71d6dc05800221e1dae34d9c69a9a512d1`
- Sizing: `5d77340407afe1b6043a1ac14ef742bc9a30b5f7`
- Typography: `08f999cceaf7d43b83ecd969e7554c0033094e3f`

> **⚠️ The Value column below is light-mode rendering, reference only — bind the variable.**
> Every hex in these tables is what the token resolves to in Figma's *light* theme. They are here to make the tables readable, not to be used. Dark mode is in for Phase 1 **only because implementation binds `--figma-color-*` directly**; the moment a value is pasted as a literal, that guarantee is gone and dark mode breaks silently — it will still look correct to anyone developing in light theme. Bind the variable. Never the hex.

### Backgrounds

| Token | Value | Role |
|---|---|---|
| `bg/default` | `#FFFFFF` | Plugin surface, header, tab bar, summary bar, content area, row default state |
| `bg/selected` | `#E5F4FF` | Row selected state background (Overflow + Extract rows) |
| `bg/secondary` | `#F5F5F5` | Subtle backdrops (component set frames on the docs page) |
| `bg/info/default` | `#E5F4FF` | Applied Banner background (subtle light-blue info tint) |
| `bg/brand` | `#0D99FF` | Scan button fill (primary action) |

### Text

| Token | Value | Role |
|---|---|---|
| `text/default` | `#000000` @ 90% opacity (renders ≈ `#1A1A1A`) | Primary body text, active tab labels, plugin name, section labels, count text |
| `text/secondary` | `#000000` @ 50% opacity (renders ≈ `#808080`) | Inactive tab labels, sort dropdown, empty state secondary text |
| `text/tertiary` | `#000000` @ 30% opacity (renders ≈ `#B3B3B3`) | Metadata, un-measurable row meta, Extract Row key text, section subs |
| `text/brand` | `#007BE5` | Accent/link (Revert action, `Export ▸` link in Extract summary) |
| `text/warning` | `#B86200` | Clips severity meta text |
| `text/danger` | `#DC3412` | Overflows severity meta text |
| `text/onbrand` | `#FFFFFF` | Scan button label |

### Icons

| Token | Value | Role |
|---|---|---|
| `icon/secondary` | `#000000` @ 50% opacity (renders ≈ `#808080`) | Default icon — header close, row jump target, dropdown chevrons |
| `icon/warning` | `#FFCD29` | Clips severity strip |
| `icon/danger` | `#F24822` | Overflows severity strip |
| `icon/success` | `#14AE5C` | Fits severity strip |
| `icon/tertiary` | `#000000` @ 30% opacity (renders ≈ `#B3B3B3`) | Un-measurable severity strip |

### Borders

| Token | Value | Role |
|---|---|---|
| `border/default` | `#E6E6E6` | Tab bar bottom, summary bar bottom |
| `border/menu` | `#383838` | Extract Row neutral strip only. Strong-contrast value from UI3 (menus are meant to visually pop on light surfaces). **Removed from the Fits severity strip** — see the severity ramp note under LS-19. Legitimate on the Extract row, where there is no severity concept for it to misrepresent. |
| `border/selected-strong` | `#007BE5` | Active tab underline (2px), Applied Banner left border (3px) |

### Typography

| Token | Value | Role |
|---|---|---|
| `font/family/mono` | `Roboto Mono` | Bound to Extract Row key text |

### Sizing

| Token | Collection | Role |
|---|---|---|
| `Radius/radius-small` | Sizing | Corner radius on Control Bar selects and the Scan button. First non-color bindings on the plugin surface. |

### Icon components

*Instances of published UI3 icon components. Vector fills bound to `icon/*` tokens, never filled directly.*

| Icon | Component key | Used for |
|---|---|---|
| `icon.16.chevron.right` | `af9f3d00455a37f1c1dcba495ad583eaac59d17f` | Export link disclosure |
| `icon.16.chevron.down` | `ff0c4fdf34401994a32ade80aafcabf167ca17d8` | Language select, scope select, Show filter, Sort |
| `icon.16.close` | `f77bb0945a70fdadc33529de4af22c0adc33b98f` | Plugin Header close — swapped at the **master**, so all 9 instances inherit |
| `icon.16.arrow` | `d99ed641d875285340ff451b948261110fac0b70` | Jump affordance — Results Row and Extract Row |
| `Menu row/Checkmark` | `8af38b6322d312e947b0745f6b5fdf938b0c3c6c` | Dropdown menu rows, single-select |

**Composite labels.** Sort, Show and Export were single text nodes carrying their own trailing glyph (`Sort: severity  ▾`, `Export  ▸`). Each is now a label text plus an icon instance in a 2px auto-layout wrapper, so the icon tokenises independently of the label. Export's chevron binds to `text/brand`, not `icon/secondary` — it's part of the link, not neutral chrome.

**Hit areas survive the swap.** The close control keeps its 24×24 frame with a 16×16 icon centred inside it. Icon size and target size are separate concerns; shrinking the frame to the icon would have quietly cut the tap target by half.

**What is *not* an icon.** `•` separators in row meta (`LoginModal  •  overflows 22px`), `—` in `hug — no boundary`, and `…` in French UI copy are typography inside running text. They stay. The rule targets glyphs standing in for icons, not punctuation. A sweep of all 9 shells plus the header, banner and both row sets returns **zero** remaining icon-glyphs.

### Dropdown menus — open states

`Section — Dropdown Menus`. One menu per Dropdown control, built from `Menu row/Checkmark` — single-select with a tick on the current value, the pattern Figma uses for its own pickers.

| Menu | Options |
|---|---|
| Language | French (fr-FR) ✓ · German · Spanish · Japanese · Arabic · Portuguese |
| Scope | Selection · Page ✓ |
| Show | Issues ✓ · All nodes · Overflows · Clips · Un-measurable · Fits |
| Sort | Severity ✓ · Document order · Container · Overflow amount |

**Menus are dark (`bg/menu/default`) against a light panel.** That is UI3 behaviour, not an inversion — and it retroactively explains `border/menu` resolving to `#383838`: menu tokens are authored for a dark surface. That token was the original Fits-strip defect (review item 4); seeing the menus makes clear it was never a neutral divider colour.

**`Show` is the filter's full range**, not the binary the review implied. Issues / All nodes are the two summary modes; the four severities below let a user isolate one class — inspect only clips, or confirm the un-measurable set before trusting a clean scan.

**Sort gains `Overflow amount`.** With a px delta on every row, sorting by magnitude is the ordering that answers "what breaks worst" — the question the product exists for.

### Jump affordance — `icon.16.arrow`

**Jump affordance — `icon.16.arrow`** (key `d99ed641d875285340ff451b948261110fac0b70`), bound to `icon/secondary`. The diagonal arrow signals that the action **leaves the panel**: it moves canvas selection and the viewport, rather than navigating within the list. Rejected: `icon.24.select` — concentric circles, which at row scale read as a selected radio button and collide with the row's own `Selected` state; chevron-right, **including `icon.16.navigate.forward`, which renders the same glyph**, both reading as drill-in; and `icon.24.zoom.in.small` — a magnifier reads as a zoom control, a viewport tool rather than a per-node action. The library ships no 16px select icon (`icon.24.select` and `icon.24.select.matching.small` are both 24px), so keeping the target metaphor at the row's 11px type scale was never available. Decided 2026-08-21 by Muhammed Hesham; recorded on canvas at `301:1549`.

**Verified by measurement, not by eye** — 13 geometric and token checks pass (tooltip and arrow clear of the icon, both centred on it, fill/radius/shadows/typography matching the UI3 source). Not yet visually reviewed; `get_screenshot` was locked to another document.

**Tooltip on hover — `Zoom to node`.** The icon alone says *there is an action here* but not which one. `Section — Jump Affordance` shows the hover state: tooltip left of the icon (so it never clips the panel's right edge), arrow pointing right at the target, 8px clear.

> **The UI3 `Tooltip` set exists but is unpublished.** Set `12837607d4953c3334106301244d0fe63a4b7841`, on the library's **Tooltips** page, 8 variants on a `Direction` property. Neither `importComponentSetByKeyAsync` nor `importComponentByKeyAsync` on individual variant keys resolves it — the same wall as `_Tab`. It is therefore **mirrored exactly**, not approximated: `#1E1E1E` fill, 5px radius, 4/8 padding, Inter Medium 11 / 16px line-height / 0.5% letter-spacing, white label, the `M 6 0 L 12 6 L 0 6 L 6 0 Z` arrow, and all three drop shadows (`0/1/3 @10%`, `0/5/12 @13%`, `0/0/0.5 @15%`).
>
> This is the **only mirrored component on the surface** and the only thing that will not track a UI3 update. Swap it for the real instance if Figma ever publishes the set. Recorded here so it is not mistaken for an invention.


### Tried and rejected

- `bg/assistive` — resolves to hot pink `#FF24BD`. It's UI3's AI-assistant color (Figma AI highlights), not a generic info tint. Replaced with `bg/info/default` for the Applied Banner.
- **Custom resize-grip vector.** A hand-drawn three-stroke diagonal grip was built for the resizable-window work and **removed** — it was a custom icon, which the kit rule prohibits. UI3 ships no resize-grip icon; `icon.24.expand` exists but means zoom / maximise / full-screen, so borrowing it would attach wrong semantics to the control. The grip is gone from all 9 shells with nothing in its place. *(Corrected 2026-09-01: this previously said the affordance is "the native corner cursor, which the browser provides on a resizable iframe" — **no such affordance exists**. Corner-drag is not native to Figma; a plugin implements it by tracking pointer movement and calling `figma.ui.resize()`. Removing the grip removed the capability. Resolved as edge-drag — see Window dimensions.)*
- **Typographic glyphs as icons** (`▾`, `›`). Replaced with UI3 icon instances. Glyphs can't bind to `icon/*` tokens, don't scale with the kit, and render inconsistently across platforms.
- **`Combo input` for the selects.** It is UI3's *numeric* input-with-dropdown — default value `16`, "Selected input" states for typing. It also ships a `#0D99FF` ring in its resting state that had to be overridden, and a grey `#F5F5F5` input fill. Replaced with `Dropdown`, which is the picker, renders white on `border/default`, exposes `Disabled`, and needs no overrides. *The override requirement was the signal that the component was wrong.*

### Implementation notes

- **Fallback colors matter.** When binding a UI3 variable to a paint via `setBoundVariableForPaint`, the paint's own `.color` property is the fallback that shows if Figma can't resolve the binding on render. Use a type-appropriate fallback (white `{r:1,g:1,b:1}` for `bg/*` tokens, dark for `text/*`, etc.) — never leave it at black. A black-fallback content area rendered as a big black rectangle on the Empty Extract Shell before this was caught.
- **`fontFamily` binding** — text nodes can have their family bound to a UI3 typography variable via `textNode.setBoundVariable('fontFamily', variable)`. The bound font must be preloaded via `figma.loadFontAsync` (both style variants if switching between them).

---

## ✅ Completed

### Brand identity — "Clipped Bar" — DONE
The mark, palette, and typography for LocaleSync's brand identity. **Applies to logo, marketing surfaces, and brand assets only — not to the plugin chrome.**

| Token | Value | Role |
|---|---|---|
| Display / wordmark | **Space Grotesk Bold** | Logo, marketing headings |
| UI / body | **Inter** | Body text, marketing |
| Marigold | `#E8A33D` | Overflow tail, brand accent |
| Charcoal | `#1B2437` | Primary dark, wordmark |
| Cream | `#F2EDE4` | Light surface (marketing) |
| Slate | `#5A6478` | Secondary text, boundary rules |

Mark: a text bar interrupted at a dashed boundary with a marigold overflow tail. Compact variant with solid boundary exists for 32px and under, where the dashed line becomes invisible. **Compact 24×24 component variants** now exist on the brand page — `Mark / Dark`, `Mark / Light`, `Mark / Mono` — for use in the plugin header and other small-scale contexts. Brand file: `UlcEw6zdZzpIpxqrBz4X53`, brand page `95:2`.

### DES-1 state matrix — copy DONE, states rebuilt

All six plugin states, with resolved copy: **No selection · No text on page · Fonts unavailable · Scan stopped · Large file · First run**. This copy is the durable artefact — it is what the states were rebuilt from.

Built as the `Plugin Shell — States` component set (`289:1420`) — see *Deliverable 3* under LS-19.

Per the strict kit rule the states get Figma icons where one is needed and no illustration where it isn't, matching Figma's own empty-state approach. The marigold-on-light accessibility gap dissolves along with the illustrations.

> **The original DES-1 frames were lost with the deleted legacy Page 1** and are not in this file. This changed LS-14's scope: it was written as *"replace the Clipped Bar illustration compositions on the DES-1 frames,"* and there were no compositions to replace. It became *build the six states on the plugin shell* — done — leaving LS-14 with only the wiring into the feature panels. Kept because the Linear ticket still carries the original wording.

### LS-9 — Extraction list + shell — DONE
Built on the `🧩 Plugin — Phase 1` page, reusing the LS-19 shell structure (header + tab bar + apply/revert scaffolding) with Extract tab active.

- **Extract Row component set** (2 variants: Selected=True/False): 3px `border/menu` neutral strip (no severity concept in extraction) + content stack + jump target (`icon.16.arrow`). String on top (`body/body.medium`, 11px, `text/default`), i18n key below with `fontFamily` bound to UI3 `font/family/mono` (resolves to Roboto Mono) and `text/tertiary` color — the key line is 11px with a custom 1.3 line-height, since `font/family/mono` has no UI3 text style behind it. Verified against `199:230`.
- **Populated Extract Shell**: Extract tab active. Summary bar shows `12 strings extracted` + `Export ▸` action link in `text/brand`. 8 sample rows with i18next-style keys (`auth.signin.button`, `home.welcome`, `checkout.success.delivery`, etc.); row 4 selected to demonstrate state.
- **Empty state**: Centered `No strings extracted` + hint `Run Scan to extract translatable strings.` Same treatment as Overflow empty state.
  - *Scope-neutral by design.* The hint previously ended "…from this page", which contradicts the scope selector the moment it reads `Selection`. Copy must not restate a value the user controls.

Downstream: LS-6 Export panel is now unblocked — extraction feeds export.

### Marketing & validation visuals — DONE
Landing page (`index.html` with live JS overflow demo), `privacy.html`, OG image, Instagram carousel — all deployed at `localesync.netlify.app`. Marketing surfaces, not product UI. They prove the brand renders well; they do not reduce the plugin-UI work below.

---

## 🟡 In progress

### LS-19 — Overflow results-panel anatomy + apply/revert pattern — IN PROGRESS

**Status corrected 2026-08-08.** This section previously read DONE. Linear has LS-19 `In Progress` with three of four success criteria unchecked (shell anatomy, apply/revert reusability, state matrix), and the LS-19 design review confirms Linear is the accurate state. The work below is built and correct; what makes the ticket incomplete is a scope gap — LS-19 Deliverable 1 enumerated header, shell, row anatomy, severity treatment, un-measurable display, and jump-to-node, but never named the panel's **input controls**, and Deliverable 3 (state matrix) is still open.

**Built (below):** plugin header · shell · results row component set · severity treatment · applied banner · apply/revert proven across three shells · empty states.

**Also built (2026-08-08):** the panel control cluster — target-language selector · scan trigger · scope control · filter · in-flight state. Detailed below.

**Deliverable 3 closed (2026-08-08)** — the six DES-1 states are built as the `Plugin Shell — States` component set (`289:1420`). All four LS-19 deliverables are now complete on the design side. **Linear remains the source of truth for the ticket state.**

*Built on UI3 —* every fill, text color, and border binds to a UI3 semantic token.
Built on the `🧩 Plugin — Phase 1` page in the LocaleSync Figma file (root `196:222`). No hex literals in the plugin surface, with **one recorded exception**: the mirrored `Tooltip` on the jump affordance carries literal fill, radius, type and shadow values because the UI3 set is unpublished and cannot be instanced — see *Jump affordance*. Custom shape structure retained for now; swapping in actual UI3 component instances is a follow-up task once specific component keys are identified.

**Deliverable A — Overflow results-panel anatomy (LS-5 + LS-8):**
- **Plugin Header** (40px, persistent at top of every shell): `Mark / Dark` logo (24×24 compact variant, purpose-built for small sizes with solid boundary where the dashed line would otherwise vanish) + "LocaleSync" name (Inter 13 Semi Bold) on the left, `✕` close button (24×24) on the right. This is **identity, not chrome** — the UI3 rule applies to controls/tokens/patterns, not to the plugin's own logo and name.
- **Plugin Shell** (`400×720`, min `340×480`, resizable): 5-tab feature nav (Overflow · Extract · Preview · Pseudo · RTL). Tab Bar and tabs are `FILL`, so they distribute — 80px each at default width, 68px at minimum. Active shows `border/selected-strong` 2px underline + `text/default`; inactive `text/secondary`. Nine standalone shells plus the `Plugin Shell — States` set.
- **Results Row component set** (8 variants: 4 severity × 2 selected): 3px severity strip + string + container•status + jump target (`icon.16.arrow`). 56px tall, two-line content — **both lines `body/body.medium`** (11px / 16px line-height / +0.5% letter-spacing); hierarchy is carried by colour alone, not size, because UI3's ramp has no 12px step. 3px strip, 16px horizontal / 8px vertical content padding, 8px gap, 4px between the two text lines. Verified against `184:68`.
- **Row string truncation** (review item 6): single-line ellipsis at row width — `textTruncation: ENDING`, `maxLines: 1`, `layoutSizingHorizontal: FILL`. The row does not grow, wrap, or clip mid-glyph. Full string is reachable via jump-to-node. **Meta line truncates on the same rule** — container names in real files get long too.
  - **Demonstrated, not just specified.** Both overflow shells carry a 141-character consent string (`ConsentBanner • overflows 96px`) whose natural width is 770px against a 349px box — a 421px overshoot. The properties were set from the start, but until this row existed no frame on the canvas actually triggered them, so a reviewer had nothing to check the behaviour against. A truncation rule that never fires in the mock is an assertion, not a decision.
- **Severity strip tokens** (review item 4): `icon/success` fits · `icon/warning` truncates · `icon/danger` overflows · `icon/tertiary` un-measurable.
  - *The defect.* `border/menu` (`#383838`) originally sat on Fits, putting the heaviest mark on the row in the safest state. Worse, black isn't a position on a severity scale at all — it read as *different* and *heavier*, not as a rank. A severity strip is a pre-attentive channel; if the mark doesn't track severity the channel actively misleads.
  - *Interim fix, superseded.* The strip was first removed entirely, leaving an unfilled gutter. That corrected the inversion but introduced a subtler problem: **absence conflates "checked and safe" with "not evaluated."** Un-measurable is already grey — honestly "couldn't check" — so a blank Fits row and a grey un-measurable row both said "no signal here" in slightly different ways.
  - *Resolution — green.* `icon/success` makes Fits mean *checked, passes*. Green → yellow → red is a proper ordinal ramp where **hue** carries the order, so weight parity across the three is correct rather than a problem. Grey stays outside the ramp, which is right: it isn't a severity, it's an absence of measurement. This also gives LS-8's *"every safe node is not flagged"* criterion something affirmative for a reviewer to look at.
  - *Why not blue.* Blue is load-bearing elsewhere on this surface — `border/selected-strong` on the active tab, the Applied Banner left border, the Scan button, the Revert and Export links. A blue severity strip would read as *selected*, colliding with the row's own `bg/selected` state.
  - *Meta text stays `text/secondary` on Fits,* not `text/success` — **the meta line already makes the distinction green would add.** Fits is 50% and un-measurable is 30%, so "checked and safe" vs "couldn't check" is encoded there by weight. That was precisely the gap green filled on the *strip*; it doesn't exist on the meta. Green would be a third encoding of a distinction already carried twice.
  - *The two channels do different jobs.* The strip is the **rank** channel — every severity gets a mark, hue carries the order. The meta is the **attention** channel — tint means *needs action*, and Fits needs none. Revisit only if the strip is ever dropped or the list gets dense enough that a 3px mark stops registering, at which point the meta has to carry rank alone.
  - *Not a contrast argument.* UI3's text tints are already darkened for small text — `text/warning` `#B86200` and `text/danger` `#DC3412` are far darker than their `#FFCD29` / `#F24822` strip counterparts, and `text/success` would be tuned the same way. Green meta would pass AA; it's simply redundant.
  - *Redundant coding.* Hue is not the only channel — the meta line states `fits` / `clips 8px` / `overflows 22px` in words, so red-green colour vision deficiency doesn't cost the user the signal.
- **Row selected state**: `bg/selected` across the whole row.
- **Meta text tokens**: `text/secondary` fits · `text/warning` truncates · `text/danger` overflows · `text/tertiary` un-measurable.

> **Vocabulary note (v3.2):** `truncates` matches `OverflowVerdictValue` in `src/common/models.ts`, which has no `'clips'` member. The canvas variant value was renamed `Clips` → `Truncates` on `184:96` on 2026-09-03. **User-facing copy is deliberately not renamed** — the `Show` filter option and the row meta string still read "clips", which is better English for the reader. The variant name is implementer-facing and must match the union; the copy is LS-14's to settle.
- **Meta vocabulary matches the variant name.** Fits rows read `fits`, not `OK` — the master carried `OK` while every instance said `fits`. One state, one word.
- **Sort control**: text-based dropdown ("Sort: severity ▾"), Figma-native pattern.
- **Empty state**: centered text only, no illustration. `No issues found` / `All 32 nodes fit their containers.`
  - *Headline uses "issues", not "overflow".* The scan surfaces three severities — overflows, clips, un-measurable — and all three list under `Show: issues`. An empty list means none of the three were found, so `No overflow detected` named a narrower condition than the state it sat on: a file with four clipping nodes and zero overflows would show a *populated* list, making the old headline wrong for its own state. "Issues" is the word the filter, the count and this state now share.
  - *The sub-line reports what was checked, not just what wasn't found.* `All 32 nodes fit their containers` is the same claim the green Fits strip makes per row, stated once for the whole scan — and the node count is the evidence that a scan actually ran. Distinguishing "scanned, everything passed" from "nothing happened" is the same problem green solved on the strip channel.
  - *Safe to assert "all fit" here* because un-measurable rows list under `issues` too. If any node couldn't be measured, the list is not empty and this state never renders.

**Deliverable B — Apply/revert affordance pattern (LS-10 + LS-11 + LS-12):**
- **Applied Banner component set** (`321:1613`, 2 variants on a `Type` property): `bg/info/default` background (subtle light-blue info tint — `bg/assistive` was tried first but UI3 defines it as the hot-pink AI-assistant colour), 3px `border/selected-strong` left border, 40px tall, 16px horizontal / 8px vertical padding.
  - **`Type=Applied`** (`185:31`) — message left (`text/default`) + `Revert` right (`body/body.medium.strong`, `text/brand`).
  - **`Type=Restored`** (`321:1610`) — message only, no action: *"Restored your canvas from an interrupted session."* This is LS-4's restore-on-launch surfacing itself; a Revert affordance would be meaningless, because the restore is what already ran.
- **Positioned above the tab bar** — persistent, plugin-wide, not tab-specific. This is the semantic call: apply state is global, not per-tab.
- **Pattern proven identical** across three feature shells (Preview, Pseudo-loc, RTL Mirror) side-by-side.

Downstream tickets (LS-9 extraction, LS-10 pseudo-loc detail, LS-11 RTL detail, LS-12 preview detail, LS-6 export panel) can now proceed — the shell and row are established.

---

#### ✅ Deliverable 4 — Panel control cluster

The panel's **input** surfaces, never enumerated in LS-19 Deliverable 1. All four are **built**.

> **Numbering.** Headings below use the numbering from the **body** of the LS-19 design review (Ahmed, 2026-08-07), which is the scheme quoted in Linear comments. Note the review's own summary table uses a different, stale numbering — the body is authoritative. Review items 4 (Fits strip inversion), 6 (row truncation) and 7 (window dimensions) are recorded elsewhere in this doc, not in this section.

#### ✅ Control Bar — target language + scope + scan (review items 1 & 2)

Built as one bar rather than three controls, because they share horizontal space and their layout decisions are coupled.

**Placement — below the tab bar, at the top of the content area.** State is global (tab switches preserve both selections), but the bar renders where its *output* lands. This is deliberately unlike the Applied Banner, which sits **above** the tab bar: the banner reports a mutation to the user's file, so it belongs outside the tab region; the control bar is the input that produces the list directly beneath it.

**Anatomy** — 40px, `bg/default`, 1px `border/default` bottom only, 16px horizontal padding, 8px gap:

| Control | Sizing | Notes |
|---|---|---|
| Language select | `FILL` | Absorbs slack; label truncates `ENDING` first at minimum width. Label + `▾`, matching the existing `Sort: severity ▾` pattern. |
| Scope select | `HUG` | `Selection` / `Page`. |
| Scan button | `HUG` | Primary — `bg/brand` fill, `text/onbrand` label, Inter 11 Semi Bold. |

Selects use `bg/default` fill, 1px `border/default`, `text/default` label, `text/secondary` chevron. All four corners bound to `Radius/radius-small` from the UI3 Sizing collection — the **first radius bindings on the plugin surface**; previously only colors were bound.

**Scan is a separate trigger, not a re-run-on-change selector.** Changing the language sets state; Scan runs it. A selector that re-scans on every change makes an expensive traversal fire on an accidental click, and on a 1–2k-node file that is the difference between a control and a hazard.

**The Extract variant carries no language selector.** Extraction reads *source* strings off the canvas — a target language is meaningless there. Extract shells show scope + Scan only, `SPACE_BETWEEN`. This also resolves the dangling LS-9 empty-state copy, which promised a *"Run Scan"* control that did not exist.

**Present on:** Overflow populated + empty, Extract populated + empty. Not on Preview / Pseudo-loc / RTL — those don't scan, and their own controls are LS-12 / LS-10 / LS-11. They read the same global language state, which the Applied Banner already surfaces (`Preview: French (fr-FR)`).

**Empty-state restructure.** Both empty content areas previously carried 32px padding with the message as a direct child, which inset the bar to 336px. Padding moved off the content area onto a new `Empty State` wrapper (`FILL`/`FILL`, centred); the bar now spans the full 400.

#### ✅ Filter + list scroll (review item 5)

**Filter lives in the summary bar, not the control bar.** The control bar holds *scan inputs* — things that change what gets measured. The filter changes what's *displayed* from a scan already run, which is the same class of control as Sort. Grouping them right-aligned keeps that distinction legible: inputs above the divider, view controls below it.

**Summary bar** — `Count` left, `List Controls` group right (`Show: … ▾` + `Sort: … ▾`, 12px gap). Both selects reuse the existing text-dropdown pattern.

**The count reads `shown of scanned`, not `N issues`.** The old `7 issues` label couldn't survive a filter that shows everything — as soon as the list can display fits rows, a label counting only issues is wrong. `24 of 32` is true under every filter state.

**Both shells' counts match their actual row counts.** A label a reviewer can't count against the canvas is the failure mode from the last review; `24 of 32` means 24 rows are built and 32 exist across the two states.

**Scroll.** `Rows` is the scroll container — `FILL` vertical, `clipsContent`, `overflowDirection: VERTICAL`. Control bar and summary stay pinned; only the list moves. Populated shell carries 24 rows against ~562px of visible list — 10 rows visible, 782px of overflow.

**Scrollbar thumb — 6px, `radius-full`, `icon/tertiary` @35%,** absolutely positioned (`MAX`/`MIN`) at the right edge of `Rows`, 3px inset. Clipping alone proves rows exist below the fold but tells the user nothing about reaching them.

**The thumb is sized proportionally, and that carries information.** Height = visible ÷ total × visible: **234px** on the issues shell (42% of the list visible) against **176px** on the All Nodes shell (31%). The shorter thumb communicates "more below" without any copy, and the two shells read as different-sized lists at a glance.

> **Implementer note — do not build a custom scrollbar.** The thumb on these frames is a *mock representation* of the browser's native overlay scrollbar, which the plugin iframe gets for free. It exists on the canvas because Figma frames don't render one, not because it's a component to build. Drawing a custom scrollbar in the plugin would break scroll behaviour users already know and lose native momentum, keyboard, and trackpad handling.

**Sample content is French target-language strings** (`Nous n'avons pas trouvé votre commande` · `EmptyState` · `overflows 44px`). This is the canonical case — French text overflowing layouts measured in English — so the mock now demonstrates the product's actual scenario instead of English strings overflowing English layouts.

##### All Nodes shell — `258:393`

A second populated shell with the filter opened up: `Show: all`, `Sort: document`, 32 rows with 8 Fits rows interleaved. This is what retires the dead-variant finding — the `Fits` variant is no longer a component that exists but never renders.

- **Sorted by document order, deliberately.** Sorting by severity would bury every Fits row below the fold and the shell would prove nothing.
- **Validates the item 4 strip fix in context.** Green on Fits alongside amber and red makes the ordinal ramp legible in a single view — the inversion is visible as *fixed*, not just described, and the eye can still find the issues because green sits at the quiet end of the scale.
- **Gives LS-8 its missing verification path.** The criterion *"every safe node is not flagged"* now has a surface a reviewer can check against.

#### ✅ In-flight state (review item 3) — `266:839`

Closes LS-19 Deliverable 3 and the LS-15 progress requirement.

**Scan becomes Stop in the same slot.** Not a second button. A separate Stop elsewhere on the panel would leave two competing affordances on screen mid-scan and force the user to work out which one is live. `bg/secondary` fill with a `text/default` label — secondary, not danger: stopping a scan abandons work in progress, it doesn't destroy anything.

**The summary row carries progress at its existing 35px height,** so nothing shifts when results land — the row is already in place, it just changes what it says. Left: `Scanning… 1,284 of 3,410 nodes`. Right: `6 found`, a running yield count. Filter and Sort are stripped while scanning; they're meaningless against a partial list, and showing them greyed would imply they become usable at some point during the scan rather than after it.

**Determinate progress bar**, 2px, `bg/brand`, absolutely positioned (`MIN`/`MAX`) along the summary's bottom edge — the row's existing `border/default` is the track, so the bar costs no vertical space. Width is the real fraction (38% at 1,284 of 3,410), not a decorative constant.

**Rows stream in as found.** Six partial results are already listed while the scan continues. This is the decision that matters most on the files LS-15 exists for: a determinate bar over an empty list is dead time, whereas partial results let the user jump to a break before the scan finishes. On a 1–2k-node file this is the state they look at longest.

**Node-count threshold — advisory, provisional at `500`, to be replaced by the LS-15 benchmark.** *(Revised 2026-09-01.)* The earlier `2,000` was circular — it equalled `large-file.fig`'s own size, so the fixture built to validate the *Large file* warning would never have triggered it. `500` is a placeholder chosen so the fixture exercises the path. The real bound is a **time budget**, not a node count: LS-15 measures per-node clone cost and derives the count from it. The threshold is **advisory only** — it governs when the pre-scan warning fires and never blocks a scan, because the in-flight state already handles unbounded files (determinate progress, live count, streaming rows, Stop).

**Not built here:** the *Scan stopped* terminal state. Its copy already exists in the DES-1 state matrix and it belongs with that work (LS-14), not with the in-flight shell. The Stop **affordance** is delivered; the state it lands on is DES-1's.

---

#### ✅ Deliverable 3 — DES-1 state matrix — `289:1420`

Built as **one component set with a `State` variant**, not as standalone frames per state. With nine shells already on the page, six more standalone copies would mean fifteen surfaces drifting independently the next time the header, tab bar or control bar changes. The variant set is also what makes the states consumable by the feature panels — LS-14's second half.

| `State` | Copy | Notes |
|---|---|---|
| First run | *Ready to scan* / Choose a target language, then run a scan to find text that breaks its container. | Action is Scan |
| No selection | *Nothing selected* / Select a frame or layer to scan, or switch scope to Page. | Scope select reads `Selection`; only reachable **because** the scope control now exists |
| No text on page | *No text layers here* / This page has nothing to check. Try another page. | Distinct from "No issues found" |
| Fonts unavailable | *Fonts unavailable* / 3 fonts could not be loaded. Text using them will be listed as un-measurable. | Degrades rather than blocks — ties to the un-measurable severity |
| Large file | *Large file — 3,410 nodes* / Scanning may take a moment. You can stop at any time. | **Not blocked on the LS-15 threshold** — the number governs *when* this fires, which is engine logic; the state only reports the count |
| Scan stopped | *Stopped at 1,284 of 3,410* · `6 found` | **Keeps its partial results** |
| Operation failed | *Couldn't complete* / The operation failed and your canvas was restored. Nothing was left changed. | Added after DES-1. Reports the LS-4 mid-batch rollback — the point of the copy is that **nothing was left changed**. The only state in the set carrying an action: `Try Again` (`321:1606`) |

**Three of the six are empty states and had to be made distinguishable.** Each needs a different next action — select something, switch page, press Scan — so the work was actionable copy, not three variations of an empty panel.

**`No issues found` cannot double as `No text layers here`.** One says *32 nodes were checked and passed*; the other says *there was nothing to check*. Collapsing them would undo the distinction the green Fits strip exists to make.

**Scan stopped retains its six findings.** The user pressed Stop; they did not discard work. The progress bar is removed, the selects unlock, and the button reverts from Stop to Scan. Showing an empty panel would throw away results the engine already produced.

**No illustrations**, matching Figma's own empty-state approach and the strict kit rule.

---

### ✅ Review item 8 — UI3 component instances

The review noted control anatomy was hand-built and would "drift when Figma updates the kit." Every hand-built control was audited against the kit.

**Swapped to kit components:**

| Was | Now | Gained |
|---|---|---|
| Scan / Stop button | `Button` — `cbbd100429689a0f2e05395d3de4758b03fe8484` | Primary/Secondary variants, hover/active/focus, **Disabled**, Label as TEXT property |
| Language / Scope selects | `Dropdown` — `83fced506cfdb4e2cf8637c17976ce3f5d5fe3ef` | `Focused`/`Active`, **`Disabled`**, `Stroke` toggle, kit chevron |
| Show / Sort controls | `Dropdown`, `Stroke=False` | Same component, borderless — the summary-bar treatment is a *variant*, not a different control |
| Jump / close / chevrons | `icon.16.*` instances | See *Icon components* |

**`Dropdown`, not `Combo input`** — see *Tried and rejected*.

**Show and Sort are the same component as the selects.** Borderless vs bordered is `Stroke=False`, so the summary bar and control bar share one control with two treatments rather than two hand-built lookalikes.

**Genuinely absent from UI3 — these stay custom:**

| Surface | Why |
|---|---|
| Tab bar | `Tabs` **exists**; see the note below — the reason it can't be used is structural, not a capacity or width limit. |
| Progress bar | No component. `Slider` is an interactive input; `icon.24.progress.small` and `icon.24.loading.small` are both `@fpl-icon-internal` spinners. |
| Applied Banner | No banner or toast component in the kit. |
| Results Row / Extract Row | No component. Bespoke 56px two-line severity row. |
| Scrollbar thumb | Mock of the native overlay scrollbar; not a component in any kit. |

**Layout consequences of adopting kit sizing:**

- **Control bar 44px → 40px**, matching header and tab bar. Kit controls are 24px against the 25–28px hand-built approximations — the kit is denser, which is the point of using it.
- **Summary rows are 40px, padded 8px** where they hold a 24px Dropdown (8/24/8). *(Corrected 2026-09-01: this read "re-padded to 6px, holding the row at 36px". Verified against canvas — `185:57` is 40px with its controls at y=8, height 24. 6px and 10px are also off the UI3 `Spacers` scale, which the band-rhythm rule now requires.)* All four bands — header, tab bar, control bar, summary — are a uniform 40px.
- **Show / Sort sized to their own labels** (80–114px), not the 117px default. At the 117px default the summary row overflowed the 340px minimum; `List Controls` gap also went 12 → 8. Worst case now 301px against a 308px budget.

#### Why the tab bar stays custom — precisely

`Tabs` (`6a6037b7ec6339f7bc2c92e003c801fe2a5ce9ec`) ships variants `Tab Count = 1/2/3/4`. The plugin needs five.

**It is not a width problem.** Four kit tabs measure 245px total; a fifth lands around 297px — comfortable at 400px and still inside the 340px minimum.

**It is not a UI3 rule either.** Nothing in the kit forbids five tabs. The individual tab is its own set, `_Tab` (`025ce4f128d972cf543160f566c97228597981ab`), with `Single Tab` / `Selected` / `State` variants, and the `Tabs` wrapper is a plain horizontal auto-layout holding N of them.

**The blocker is structural, and it is twofold:**
1. `_Tab` is prefixed with `_`, the kit's private-component convention. It is not published, so `importComponentSetByKeyAsync` fails on it — five tabs cannot be composed from the primitive.
2. Figma refuses `appendChild` on an instance (*"Cannot move node. New parent is an instance or is inside of an instance"*), so a fifth tab cannot be added to a `Tabs` instance.

The only route to five is **detaching** a `Tabs` instance — which produces a detached frame carrying the kit's segmented-pill styling and none of its update-tracking. That is strictly worse than a clean custom tab bar, which at least owns its pattern honestly.

**Secondary, but worth stating:** `Tabs` is a *segmented control* — 24px, grey active pill. The plugin's nav is a 40px underlined bar. Different pattern, chosen before this audit.

**Open product question.** A kit that stops at four is a soft signal about how many top-level tabs a Figma plugin panel should carry. Collapsing to four — for instance grouping Pseudo-loc and RTL Mirror, which are both canvas-mutating transforms sharing the apply/revert pattern — would put the tab bar on the kit component and simplify the nav. That is a **product** decision, not a design-system one, so it is recorded here rather than acted on.

**No kit overrides remain anywhere on the surface.** Every control tracks the kit with no local corrections to re-check on the next UI3 update.

**One exception, and it is not an override:** the `Tooltip` on the jump affordance is a faithful **mirror** of an unpublished UI3 set — it cannot be instanced, so it cannot track updates. See *Jump affordance*. It is the single component on the surface that will need manual reconciliation if Figma publishes or changes that set.

---

## 🔲 To be done

The LS-19 panel control cluster is built and no longer blocks the LS-8 spec. What remains is the P1 supporting feature surfaces (each reuses the shell and results-list row) and LS-14's wiring of the state set into those panels.

### P1 — Supporting feature surfaces (LS-6, LS-10, LS-11, LS-12)
Lower lift — these reuse the shell and the results list — but each needs layout decisions:
- **Export panel** (i18next-compatible JSON export as the anchor format, dedup toggle, download; drives the exportable QA report on the paid tier).
- **Preview language switcher** (active-language indicator; import JSON entry point; fallback display for untranslated strings; Phase 1 is one language at a time — a simultaneity limit, not a coverage cap).
- **Pseudo-loc controls** (expansion ratio, accent style).
- **RTL mirror control** (toggle + the applied-state indicator from the P0 pattern).

### 🔲 State matrix (LS-14) — design done, wiring remains
Originally a two-part job. Part (1), replacing the Clipped Bar illustration compositions on the DES-1 frames, **no longer exists** — those frames were lost with the deleted legacy Page 1, and the six states were rebuilt from the surviving copy as `Plugin Shell — States` (`289:1420`) with no illustrations, per the strict kit rule. Part (2) is all that remains: wire the state set into the appropriate feature panels. The Linear ticket still carries the original two-part wording and should be updated to match.

### ✅ Paid-intent affordance (LS-13) — placed

All four paid pillars are stubbed on the surface as a 40px band pinned to the bottom of Content Area, below the rows list: `Pro Stub / Matrix` (`350:1404`) on the populated overflow shell, `Pro Stub / Report` (`350:1420`) on Extract, `Pro Stub / Translate` (`350:1412`) on Preview Applied, `Pro Stub / Sync` (`351:1411`) on RTL Applied.

**One pillar per panel**, so the willingness-to-pay signal stays per-pillar rather than collapsing into one blurred upgrade click. Pseudo-loc carries no stub — there is no fifth pillar, so the absence is principled, not an omission. Absent also from both empty states, All Nodes and Scanning, which is exactly why those shells need the scroll-clearance rule recorded under *Window dimensions*.

Copy and the `openExternal` wiring remain LS-13's.

---

## ⛔ Needs no design

So effort isn't misdirected:
- **No UX surface:** LS-1 (scaffold), LS-2 (message bridge), LS-4 (snapshot/restore), LS-7 (measurement spike), the LS-6 export serializers.
- **Corrected 2026-08-08 — LS-3 and LS-15 were wrongly listed here.** Both have a UX surface and their absence from this doc is why neither got designed:
  - **LS-3 (traversal)** requires selection-scoped *and* page-scoped traversal. That is a **scope control** — without one the user can't express which they want and the spec can't state a default.
  - **LS-15 (perf)** requires progress reporting and a documented node-count threshold. That is an **in-flight state** — on a 1–2k-node file it's the state the user looks at longest, on exactly the files where the product's value is highest.
  - *Lesson for this section:* an engineering ticket with no screen of its own can still own a control. Test for "does the user have to tell the plugin something, or wait on it?" before filing anything here.
- **Not needed for this product:** a from-scratch design system, custom iconography, illustration, heavy visual exploration, motion design. Restraint is correct here.

---

## Open design decisions

### Awaiting Ahmed — carried out of the 2026-08-08 pass

These three came out of the review response and are not design calls. Recorded here so they don't stay buried in the sections that raised them.

1. ~~**LS-15 node-count threshold.**~~ **Resolved 2026-09-01.** Advisory threshold, provisional at `500`, to be replaced by the LS-15 benchmark; the real bound is a time budget with the node count derived from measured per-node clone cost. `2,000` was rejected as circular (it equalled the benchmark fixture's own size). Never blocks a scan. *(Details under In-flight state; recorded on LS-15.)*
2. **Five tabs vs four — a product decision, not a design-system one.** UI3's `Tabs` stops at four, which is a soft signal about how many top-level tabs a plugin panel should carry. Collapsing to four — for instance grouping Pseudo-loc and RTL Mirror, both canvas-mutating transforms already sharing the apply/revert pattern — would put the tab bar on a kit component and simplify the nav. Recorded, not acted on. *(Raised under Why the tab bar stays custom.)*
3. **Visual review owed on the jump affordance and tooltip.** Verified by 13 geometric and token checks, not by eye — `get_screenshot` was locked to another document during the build. Everything else on the surface has been seen rendered; this has not. *(Raised under Jump affordance.)*

### Still open

1. **Error color inside the Clipped Bar brand palette.** Currently borrowing `#E5484D` (Radix `red-9`), which hitchhiked in through early plugin frames before the strict kit rule and now sits orphaned. Will be resolved as part of a complete Clipped-Bar-native design system pass — not a one-off color pick. Not blocking any Linear ticket.

**Resolved:**
- ~~Theme adaptation vs. brand override.~~ Chrome uses Figma standard theme colors, which naturally adapts to Figma's light/dark modes via `--figma-color-*` variables. The brand palette holds regardless on marketing surfaces. Dark mode is in for Phase 1 by virtue of following Figma.
- ~~Custom components vs. Figma-native kit.~~ Figma's component kit, explicitly. Not negotiable.
- ~~Density.~~ Set by Figma's kit. No separate density decision needed.
- ~~Severity / error color inside the plugin.~~ Forced to Figma standard `#F24822` by the strict kit rule. The DES-1 frames that used `#FF2D6B` are having their illustrations replaced anyway.
- ~~Accessibility gaps on DES-1 frames.~~ Dissolve with the illustration replacement — Figma icons use kit colors, which are the a11y baseline.
- ~~Window dimensions.~~ **Re-decided 2026-08-08 — resizable, `400×720` default, `340×480` minimum.** Previously "fixed 340×560, resizable post-launch." Reopened because the Panel control cluster adds a control bar (~44px as hand-built; 40px once on kit components) to a window with no spare vertical budget: at 340×560 the list would have dropped from 8 visible rows to 7, paying a row for the controls that make the product usable. Width was the harder constraint — four controls in one bar at 340px forces two into an overflow menu for reasons of geometry rather than design.
  - **Minimum `340×480`** — the old fixed size becomes the floor, so nothing already built needs redesign. 5 tabs × 68px is exactly 340, so the tab bar returns to its current geometry at minimum width.
  - **Default `400×720`** — row string gets ~358px instead of 266, keeping the px delta and container•status legible beside longer strings; ~560px of list after the control bar means **10 visible rows**, up from 7-with-controls.
  - **No maximum** — Figma clamps to viewport.
  - **Affordance: edge-drag.** *(Resolved 2026-09-01; rationale in the LS-5 comment thread.)* Bottom edge for height, a **16×16 bottom-right corner** for both dimensions. **No right edge** — the scrollbar runs it, and the corner already yields both. **No drawn grip** — it is the only option needing an explicit kit-rule exception, and it spends a visible element in an already dense 400px panel; the `Tooltip` exception was forced, this one is not. The invisible hit areas leave the kit rule untouched, so no canvas change is required.
  - **Scrollbar clearance.** In the populated overflow and Extract shells the rows list ends at y=680 with the Pro stub at 680–720, so the corner zone sits below the scroll container. In **All Nodes** (`258:393`) and **Scanning** (`266:839`) the list runs to the window bottom — those two need **16px `padding-bottom`** on the scroll container so the scrollbar terminates above the corner zone.
  - **Implementation (LS-1 scaffold, not the engine — not yet written):** pointer handlers on the grip calling `figma.ui.resize()`. Three things the API will not do for you:
    1. **Clamping.** `resize()` accepts whatever it's given, so `340×480` is only a minimum if the handler enforces it. Unclamped, it's a suggestion.
    2. **Persistence.** Size stored in `figma.clientStorage` — a resizable window that resets to default on every launch reads as broken, not as a feature.
    3. **Restore ordering.** The `clientStorage` read is async and must resolve *before* `showUI`, or the window paints at default and visibly jumps to the stored size.
  - **Canvas updated:** all 9 shells now 400×720; Tab Bar and its 5 tabs converted `FIXED` → `FILL` so they distribute at any width (80px each at default, 68px at minimum); Plugin Header, Applied Banner, Results Row and Extract Row masters widened to 400.
  - **Knock-on:** the severity/container filter is no longer a mandatory mitigation for an unscrollable 200-row list — it stays in the cluster on its own merits (confirming a clean scan, giving `Fits` rows a home). The in-flight state gains room for a node count without crowding.
- ~~Hug-node AI-spec gap.~~ Hug nodes with a constrained ancestor measure against that ancestor's width via parent-walking and appear as normal rows. Hug nodes with no constrained ancestor show as "un-measurable" rows, same treatment as missing-font nodes. The free/paid measurement-accuracy split (deterministic JS vs. AI-enhanced) sits underneath and doesn't change the UX.

---

## Deliverables summary

All four LS-19 deliverables are built on the design side; **Linear remains the source of truth for the ticket state.** Supporting layouts + LS-14 wiring + LS-13 paid-intent affordance remain:

| Deliverable | Covers | Priority | Status |
|---|---|---|---|
| Overflow results-panel anatomy mock | LS-19, LS-5, LS-8 | P0 | ✅ **DONE** — shell, row component set, populated, empty, all-nodes, in-flight |
| Panel control cluster | LS-19, LS-8, LS-3, LS-15 | P0 | ✅ **DONE** — language selector, scan trigger, scope, filter, in-flight state |
| Apply/revert affordance pattern | LS-19, LS-10, LS-11, LS-12 | P0 | ✅ **DONE** — banner component applied identically across 3 features |
| Extraction list + shell | LS-9 | P1 | ✅ **DONE** — Extract Row component set + populated + empty state |
| Supporting surfaces | LS-6, LS-12, LS-10, LS-11 | **P1** | Layouts reusing shell + results list |
| State matrix — wiring into feature panels | LS-14 | **P1** | Six states built as `Plugin Shell — States` (`289:1420`); remaining work is wiring, not illustration replacement — the original frames no longer exist |
| Paid-intent affordance | LS-13 | **P2** | ✅ **DONE** — four Pro stubs placed: `Pro Stub / Matrix` (`350:1404`), `Pro Stub / Report` (`350:1420`), `Pro Stub / Translate` (`350:1412`), `Pro Stub / Sync` (`351:1411`) |

Brand identity (Clipped Bar) is done and DES-1 copy carries forward. LS-19's anatomy, apply/revert pattern, panel control cluster and state matrix are all built — **the LS-8 spec is unblocked**, because the panel's inputs are now enumerated and the spec can state what the UI sends. Remaining: the P1 supporting layouts that reuse the shell + row and LS-14's wiring of the state set into the feature panels — smaller pieces, each squarely in the founder's lane.

---

## Appendix — tool lessons

*Operational notes about the Figma MCP tooling, kept out of the spec above. Each cost real time this session.*

**`search_design_system` takes one intent per query — it has no OR semantics.** Compound queries like `"dropdown select input"` return diluted results. A pass using them missed both `Dropdown` and `Tabs` and produced two wrong "UI3 has no component for this" conclusions. Use single terms.

**Its index is also incomplete.** Even a correct single-term query — `Tooltip`, scoped to UI3 — returned only `Tooltip link`, while the real `Tooltip` set sits on the library's Tooltips page. **A null result is never evidence of absence.** When a component is believed to exist, read the library file directly with its file key rather than trusting search.

**Unpublished components can't be imported by key.** `_Tab`, and the `Tooltip` set, both exist in the UI3 file but resolve for neither `importComponentSetByKeyAsync` nor `importComponentByKeyAsync`. Options are: reach them as nested instances inside a published component, or mirror them from a direct read of the library file.

**`figma.appendChild` is refused on instances.** *"Cannot move node. New parent is an instance or is inside of an instance."* This is what actually caps the tab bar at four, not any UI3 rule.

**`resize()` resets sizing modes to FIXED.** Call it *before* setting `primaryAxisSizingMode` / `counterAxisSizingMode`, or auto-layout frames collapse — four menus rendered 10px tall this way.

**Mutating during `findAll` invalidates instance descendants.** Collect the target nodes first, then mutate. Removing a glyph from a component master mid-traversal crashed a whole script.

**Rotation decouples `node.x` from rendered position.** After `rotation = -90`, place using `absoluteBoundingBox` and the delta against the unrotated `x`/`y`, or the node lands offset — this put the tooltip arrow on top of the icon it was meant to point at.

**`get_screenshot` resolves against the desktop app's active tab, not the `fileKey` passed to `use_figma`.** After reading another file, every screenshot fails until the original document is re-focused *by hand*. `setCurrentPageAsync` and `scrollAndZoomIntoView` do not change the active tab. When visual checks are unavailable, verify geometry numerically — bounding-box overlap, centring, and token values are all readable.