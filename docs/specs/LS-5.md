# LS-5 — UI shell + design system

**Epic:** Foundation · **Complexity:** Med · **Blocked by:** LS-1, LS-19 (both closed) ·
**Blocks:** LS-6, LS-8, LS-9, LS-10, LS-11, LS-12, LS-13, LS-14, LS-21

The chrome every feature panel mounts inside, and the token layer every feature panel styles
against. Built once so feature issues add a panel, not a layout.

The surface is **UI3** — Figma's own design language — bound to the `--figma-color-*` variables
Figma injects into the plugin iframe. The Clipped Bar brand identity applies to the logo and
marketing assets only, never to the plugin UI. See `docs/agent-guidelines.md` §7.

**The design is built.** Nine shells, four component sets and fifteen annotated sections exist on
the Figma page `🧩 Plugin — Phase 1` (file `UlcEw6zdZzpIpxqrBz4X53`). This spec transcribes that
canvas into code contracts; where the two disagree, **the canvas wins and the discrepancy is a bug
in this spec**. Every dimension below was read off the canvas on 2026-09-03, not from `design.md`.

---

## 0. Scope

**This issue produces:** the shell frame and its bands, the panel registry and tab routing, the
applied-state banner and its context, the shared results row, the seven-state view, the UI3
primitives (`Button`, `Dropdown`, `Tooltip`, `ProgressBar`), the icon set, and the token alias
layer in `src/ui/styles.css`. Plus the one-line `showUI` change that makes the shell reviewable at
its designed size.

**This issue does not produce:**

| Not here | Owner |
|---|---|
| Overflow panel data wiring, filter/sort behaviour, `select-node` dispatch | LS-8 panel spec |
| Any user-facing copy — headlines, body, tooltips, counts, row meta | LS-14 |
| Pro stub contents and `openExternal` wiring | LS-13 |
| Resize drag, size persistence, `SHELL_MIN_SIZE` | LS-21 |
| Export controls behaviour | LS-6 |
| Apply/revert semantics behind the banner | LS-10, LS-11, LS-12 |

**The shell adds no message types.** It never imports `src/common/messages.ts`. A test asserts the
exact size of the message union (`messages.type-check.ts`); LS-5 must leave it green without
modification. Panels talk to the bridge; the shell does not.

---

## 1. Contracts

Upstream types are referenced, never redefined (`docs/agent-guidelines.md` §4). LS-5 consumes
exactly one: `OverflowVerdictValue` from `src/common/models.ts`.

### 1.1 Shared size constant

```typescript
// src/common/shell.ts — NEW. Env-neutral, ambient-free (§1). Imported by main and ui.
export const SHELL_DEFAULT_SIZE = { width: 400, height: 720 } as const;
```

Lives in `common` rather than `main` because LS-21 needs the same numbers on both sides of the
bridge to clamp a drag. LS-21 adds `SHELL_MIN_SIZE` alongside it; **LS-5 does not invent a minimum
it cannot test.**

### 1.2 Panel registry

```typescript
// src/ui/shell/panels.ts
export type PanelId = 'overflow' | 'extract' | 'preview' | 'pseudo' | 'rtl';

export interface PanelDef {
  id: PanelId;
  label: string;                        // tab label
  Panel: React.ComponentType;
  Footer?: React.ComponentType | null;  // LS-13 Pro stub; null = panel has no pillar
}

/** Registry order is tab order, left to right. One entry per feature issue. */
export const PANELS: readonly PanelDef[];
```

### 1.3 Shell

```typescript
// src/ui/shell/Shell.tsx
export function Shell(props: {
  panels?: readonly PanelDef[];   // defaults to PANELS; injectable for tests
  initialPanel?: PanelId;         // defaults to PANELS[0].id
}): JSX.Element;
```

`App.tsx` renders `<Shell />` and nothing else. Active-panel state lives in the shell, so no
feature issue edits `App.tsx`.

### 1.4 Applied state

```typescript
// src/ui/shell/applied.tsx
export type AppliedState =
  | { kind: 'applied'; message: string; onRevert: () => void }
  | { kind: 'restored'; message: string };

export function useApplied(): {
  applied: AppliedState | null;
  setApplied: (next: AppliedState | null) => void;
};

export function AppliedProvider(props: { children: React.ReactNode }): JSX.Element;
```

The union encodes the canvas rule as a compile-time fact: `Type=Restored` carries no action, so
`restored` **structurally cannot** hold an `onRevert`. Applied state is plugin-wide, not per-tab —
it survives tab switches, which is why it is context rather than props.

### 1.5 Bands

```typescript
// src/ui/shell/bands.tsx
export function ControlBar(props: { children: React.ReactNode }): JSX.Element;

export function SummaryBar(props: {
  count: React.ReactNode;        // caller-formatted; the shell holds no copy
  controls?: React.ReactNode;    // the List Controls cluster, right-aligned
  progress?: number | null;      // 0–1 → 2px bar on the band's bottom edge; null = none
}): JSX.Element;
```

### 1.6 Results list and row

```typescript
// src/ui/shell/ResultsList.tsx
export function ResultsList(props: {
  children: React.ReactNode;
  hasFooter: boolean;            // false → 16px bottom padding for scrollbar clearance
}): JSX.Element;
```

```typescript
// src/ui/shell/ResultsRow.tsx
import type { OverflowVerdictValue } from '../../common/models';

export type RowTone = OverflowVerdictValue | 'neutral';

export function ResultsRow(props: {
  tone: RowTone;
  primary: string;               // the string content
  meta: React.ReactNode;         // container • status — preformatted by the caller
  monoMeta?: boolean;            // extract key line; §7 mono exception
  selected: boolean;
  onSelect: () => void;
  onJump: () => void;
  jumpLabel: string;             // tooltip copy, supplied by LS-14
}): JSX.Element;
```

`RowTone` references the verdict union rather than declaring a parallel presentational enum, so a
new verdict is a **compile error in the row** instead of a silent fallthrough to a default colour.
`'neutral'` is the extraction case, which has no severity concept.

### 1.7 State view

```typescript
// src/ui/shell/StateView.tsx
export type ShellState =
  | 'first-run'
  | 'no-selection'
  | 'no-text-on-page'
  | 'fonts-unavailable'
  | 'large-file'
  | 'scan-stopped'
  | 'operation-failed';

export function StateView(props: {
  state: ShellState;
  headline: string;
  body: string;
  action?: { label: string; onClick: () => void };
}): JSX.Element;
```

Seven, matching the `Plugin Shell — States` set (`289:1420`). Six are DES-1's; `operation-failed`
was added afterwards and is the only one carrying an action.

### 1.8 Primitives

```typescript
// src/ui/shell/primitives/
export function Button(props: {
  variant: 'primary' | 'secondary';
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element;

export function Dropdown(props: {
  label: string;                 // renders as "Show: issues"
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}): JSX.Element;

export function Tooltip(props: { label: string; children: React.ReactNode }): JSX.Element;

export function ProgressBar(props: { value: number }): JSX.Element;  // 0–1
```

---

## 2. Resolved Defaults

Every value below is fixed. No implementer choices remain.

### 2.1 Window and band geometry

`figma.showUI(__html__, { ...SHELL_DEFAULT_SIZE, themeColors: true, title: 'LocaleSync' })` in
`src/main/main.ts`, replacing Plugma's `300×260`. `themeColors: true` is what injects the colour
variables the entire token layer depends on — without it the surface renders unstyled. `title` is
set explicitly because Figma's own window title bar is the only place the product name and close
control live — the shell draws no header band of its own (§5.7). `SHELL_DEFAULT_SIZE` is `400×680`:
Figma always draws its own ~40px chrome above the iframe (not suppressible), so the canvas shells'
`400×720` is chrome 40 + plugin 680, and `680` is the number the plugin actually renders.

| Band | Height | Rule |
|---|---|---|
| Applied Banner | 40 | rendered at y=0 only when `applied !== null` |
| Tab Bar | 40 | five tabs, 80 each — first band when no banner is present |
| Content Area | 640, or **600** when the banner is present | |
| Control Bar | 40 | 16px inset; controls 24 tall at y=8; 8px gap |
| Summary Bar | 40 | count at x=16; controls right-aligned to x=384 |
| Rows | **520** with footer, **560** without (no banner); **480**/**520** with the banner | |
| Footer | 40 | occupies 600–640 within Content Area |

The banner compresses Content Area rather than overlaying it — nothing scrolls under it.

### 2.2 Footer and scroll clearance

**The Pro stub is persistent within a panel's working states, and hidden in empty, loading and
error states.** Recorded on canvas at `415:1443`.

`ResultsList` takes `hasFooter` and applies 16px bottom padding when it is `false`. That is the
whole clearance rule: with a footer, rows end at 640 and the scrollbar clears the last row; without
one, rows run to the window edge and need the padding. LS-21 consumes this rule rather than
maintaining a per-shell exception list.

Registry footers: `overflow` → Matrix, `extract` → Report, `preview` → Translate, `rtl` → Sync,
`pseudo` → `null`. Pseudo-loc has no stub because there is no fifth paid pillar — the absence is
principled, not an omission.

### 2.3 Row anatomy

56 tall · 3px tone strip on the left edge · content padding 16 horizontal / 8 vertical · 8px gap
between content and jump icon · 4px between the two text lines.

Both lines are `body/body.medium`: **11px, 16px line-height, +0.5% letter-spacing.** Hierarchy is
carried by colour alone — UI3's ramp has no 12px step, so size is not available as a hierarchy
lever. The mono key line (`monoMeta`) is the one typographic exception: 11px at **1.3 line-height**,
because `font/family/mono` has no UI3 text style behind it.

Primary line truncates with an ellipsis on a single line. Selected rows take `bg/selected`.

### 2.4 Tone ramp

| `RowTone` | Strip | Meta text |
|---|---|---|
| `fits` | `icon/success` | `text/secondary` |
| `truncates` | `icon/warning` | `text/warning` |
| `overflows` | `icon/danger` | `text/danger` |
| `unmeasurable` | `icon/tertiary` | `text/tertiary` |
| `neutral` | `border/menu` | `text/tertiary` |

Implement as an exhaustive `switch` over `RowTone` with no `default` branch, so adding a verdict
fails the typecheck. **Note the vocabulary:** the verdict is `truncates`; user-facing copy may still
read "clips", which is LS-14's call and deliberately not unified.

### 2.5 Token layer — `src/ui/styles.css`

The single token file. Two mechanisms, because Figma gives us only one:

- **Colour aliases bind.** `--ls-*` colour tokens alias `--figma-color-*`. Nothing else in the
  codebase references a `--figma-color-*` variable directly, so a UI3 rename is a one-file edit.
- **Type and spacing are declared.** Figma injects **colour variables only** — no typography or
  spacing variables reach the iframe. So `--ls-text-size: 11px`, `--ls-text-line: 16px`,
  `--ls-text-tracking: 0.055em`, the mono `line-height: 1.3` override, and the `Spacers` scale are
  declared here as local custom properties.

**No component file carries a raw value of any kind** — no hex, no px font-size, no literal spacing.
That includes the Tooltip: it binds `--figma-color-bg-menu` rather than mirroring the canvas hex
literals. The §7 hex exception exists because the UI3 Tooltip is unpublished and cannot be
*instanced on canvas*; code has no such constraint, so the exception does not cross into the
codebase and the no-hex rule in §2.7 can be absolute.

### 2.6 Icons

Exported from the UI3 library by component key into `src/ui/shell/icons/` as inline React
components with `fill: currentColor`, so the `icon/*` colour tokens drive them from CSS.

| Icon | Key | Use |
|---|---|---|
| `icon.16.arrow` | `d99ed641d875285340ff451b948261110fac0b70` | jump affordance, both rows |

Every icon file records the UI3 component key it came from in a header comment. **An icon with no
key does not ship** — that is the code-side form of the no-custom-icons rule. The library has no
16px select icon, so the jump affordance is the diagonal arrow, not a target; the reasoning is on
canvas at `301:1549`.

### 2.7 Discipline test

`src/ui/shell/tokens.test.ts` scans `src/ui/**` and fails on:

- any hex colour literal (`/#[0-9a-fA-F]{3,8}\b/`), excluding `styles.css`, which is allowed to
  contain none either — the scan covers it too, since colours bind rather than resolve;
- any raw `font-size` declaration outside `styles.css`;
- any direct `--figma-color-*` reference outside `styles.css`.

This is what makes "no hard-coded colours in feature code" an executable criterion rather than a
review opinion, and it keeps holding after LS-5 closes.

---

## 3. Concrete Acceptance

**Fixture:** the Figma page `🧩 Plugin — Phase 1` in file `UlcEw6zdZzpIpxqrBz4X53`. `.fig` fixtures
are human-built (§6); this one exists and is the acceptance reference.

| Shell | Node | Verifies |
|---|---|---|
| Populated overflow | `185:34` | full band stack, 24-of-32 count, both list controls, footer, four tone variants |
| All Nodes | `258:393` | same panel, filter=all, footer present, tone ramp incl. `fits` |
| Scanning | `266:839` | progress on the summary band, Scan→Stop in one slot, no footer |
| Preview Applied | `186:138` | banner `Type=Applied` at y=0, Content Area 600 |
| Pseudo-loc Applied | `186:217` | banner + **no footer** → 16px clearance path |
| RTL Applied | `186:296` | banner + footer |
| Extract | `200:228` | `neutral` tone, mono key line, footer |
| Empty (overflow / extract) | `186:60`, `200:364` | state view, no bands below the control bar |
| States set | `289:1420` | all seven `ShellState` values, `operation-failed` action |

**Mechanical checks** — `npx tsc -b && npx eslint . && npm test`:

- [ ] `toneToken(tone)` returns the §2.4 token for all five `RowTone` values; removing a case fails
      the typecheck.
- [ ] `rowsHeight(hasFooter, hasBanner)` returns 520/560 with no banner, 480/520 with it — note 520
      appears at both `(footer, no banner)` and `(no footer, banner)`; a test asserting 520 must be
      checked against its own arguments, not assumed correct because the number looks familiar.
- [ ] Tab reducer: selecting each `PanelId` yields that panel; `initialPanel` defaults to
      `PANELS[0].id`.
- [ ] `tokens.test.ts` passes — no hex, no raw `font-size`, no stray `--figma-color-*` reference.
- [ ] `messages.type-check.ts` unchanged and green; the shell imports no message type.
- [ ] `npx tsc -b` is clean with `src/ui` referencing `../common` only.

**Visual checks** — `npm run dev`, import `dist/manifest.json` in the Figma desktop app, compare
against the fixture shells side by side:

- [ ] The window opens at 400×680 (plus Figma's own ~40px chrome, not part of this size).
- [ ] All five panels mount; each stub renders the `first-run` state.
- [ ] Band heights and insets match the table in §2.1 at 1:1.
- [ ] `setApplied({ kind: 'applied', … })` inserts the banner and compresses Content Area to 600;
      `{ kind: 'restored' }` renders without a Revert affordance.
- [ ] Toggling the OS/Figma theme repaints the whole surface with no unstyled or stranded element —
      the only proof that binding actually happened.
- [ ] A panel with `Footer: null` shows the 16px bottom clearance; one with a footer does not.

**Run:** `npx tsc -b && npx eslint . && npm test`, then `npm run dev`.

**Review focus:** the theme-toggle pass and the `tokens.test.ts` scan. Everything else is geometry
a reviewer can measure; those two are where a plausible-looking implementation silently hard-codes
a value that only breaks in dark mode.

---

## 4. API pins

Per `docs/agent-guidelines.md` §2 — not repeated here. LS-5 touches exactly one main-thread API,
`figma.showUI`, and one iframe-side fact:

> **Pin to add to §2.** `figma.showUI(html, { themeColors: true })` injects a `<style
> id="figma-style">` block of `--figma-color-*` variables and sets a `figma-light` / `figma-dark`
> class on the iframe's `<html>`. **Colour variables only** — no typography or spacing variables
> reach the iframe. Verified against the live plugin docs 2026-09-03. This is the fact that forces
> the two-mechanism token layer in §2.5, so it belongs in the shared pins rather than in this spec.

---

## 5. Carried forward

1. **Five tabs vs four.** The canvas ships five; whether Pseudo-loc collapses into another tab
   remains open in `design.md`. Deliberately not decided here — collapsing later is a one-line
   registry edit, which is the point of §1.2.
2. **`SHELL_MIN_SIZE` and resize persistence** → LS-21. `SHELL_DEFAULT_SIZE` is placed in `common`
   now so LS-21 adds a constant rather than moving one.
3. **All copy** → LS-14, which now inherits seven states rather than six.
4. **Row-level severity copy** ("clips" vs "truncates") → LS-14. The type is settled; the wording
   is not.
5. **No component-render tests.** Vitest stays pure (§6) — no jsdom, no testing-library. If shell
   regressions start slipping through, that is the moment to add the two dev dependencies, not now.
6. **Precision fix pending on the issue.** LS-5's requirement that `styles.css` "no longer holds
   token values" is unbuildable as written: type and spacing have no injected source and must be
   declared. §2.5 is the buildable form; the issue text should be amended to match.
7. **Canvas and code no longer disagree on the header band.** Figma's own window chrome cannot be
   suppressed (`showUI` exposes `title` only), so the shell's own header band duplicated it — two
   product names and two close buttons. Deleted from code (not renamed) 2026-09-04 during LS-5
   visual QA. The nine canvas shells still depict the full `400×720`, but that is no longer a
   discrepancy: the canvas now records the "Shell framing convention" (`435:1442`) explaining that
   the top 40px of every shell is Figma's chrome, drawn for context and not a band the plugin
   renders — the plugin iframe is the lower `680`, matching `SHELL_DEFAULT_SIZE`. The header band
   survives on canvas only as that context, not as a live component in this codebase.
