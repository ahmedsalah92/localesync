# `preview.fig` — authoring notes (LS-12 §3.2)

Built by the dev-only **Generate preview** button (`src/main/devtools/generatePreview.ts`). Run it
in a **fresh empty file or page** — it refuses a non-empty page rather than appending to someone's
work. Then complete the manual steps below, in order, and save.

Acceptance runs against it with **Run LS-12 preview check** (`src/main/preview/check.ts`).

## What each layer is for

Keys are LS-9's `dot` scheme over this structure. The import files were written from those rules
and LS-12 §2.1, not typed to match output — so the frame and layer names are load-bearing.

| Layer | Text | Key | Role |
|---|---|---|---|
| `preview › title` | Welcome back | `preview.title` | Translated in `de` and `fr` |
| `preview › cta` | Add to cart | `preview.cta` | Translated in `de` and `fr` |
| `preview › fallback` | Only in English | `preview.fallback` | No translation in either language → falls back. The edit step gives it its first value |
| `preview › mixed` | Mixed | `preview.mixed` | Two styles (Inter Regular + Medium on the second half). Has a `de` value, so it is a target — and the gate blocks it `mixed-font-char-mutation` |
| `preview › badge (instance) › inst` | Instance text | `preview.badge.inst` | An instance child. Preview is not blocked by `instance-locked`, so it is a normal owner. The instance is frame-like (LS-9 rule 5), which is why its name is a key segment |
| `components › badge (component) › inst` | Instance text | `components.badge.inst` | The master. A fallback owner in every language, kept outside `preview` so the two `inst` layers never collide on one key |
| `preview › missing-font` | Font gone | `preview.missing_font` | **Manual.** Has a `de` value, so it is a target — and the gate blocks it `missing-font` |
| `preview › title` (copy) | Welcome back | — | **Made by the check.** A `clone()` of `title`, placed right after it and removed when the run ends. It carries the original's stamp, so it is **not** an owner and is never written. A Cmd-D copy made *after* the Extract scan is optional and is checked the same way |

## Import files

- `preview/de.json` — LS-6's nested form. Imported as language `de`. One stray key, `checkout.old`,
  that no layer owns.
- `preview/translations.csv` — columns `key,de,fr`. The same stray key. Its `de` column has only
  `title` and `cta`, so importing the CSV **after** the JSON replaces `de` wholesale (§2.1.6) and
  `mixed` / `missing-font` / `inst` then fall back instead of blocking. For a by-hand panel run,
  import the CSV first and the JSON second.

The harness does not read these files — the main thread cannot. It seeds the store with the same
values, transcribed in `check.ts` under a `// from fixtures/preview/*` comment. Keep them in step.

## Manual steps

1. **Generate preview** in a fresh empty file. Fix any `FIX BEFORE SAVING` line it logs.
2. **Missing font.** `loadFontAsync` fails for an unavailable font by definition, so this row can't
   be scripted — the same limitation `rtl-mirror.md` records. Add a text layer in a font this machine
   does not have (copy one in from another file, or uninstall the font), **inside the `preview`
   frame**, named `missing-font`, text `Font gone`.
3. **Extract.** Run an **Extract** page scan with the default `dot` scheme, so every layer is stamped.
4. Save as `fixtures/preview.fig` and record the bare link in `fixtures/README.md`.
5. Run **Run LS-12 preview check** with the Preview panel idle (no language applied). It makes the
   stamped copy of `title` itself (`clone()` carries plugin data) and removes it at the end, so no
   Cmd-D copy is needed; one you made after step 3 is checked too.
6. **Cmd-Z by hand** (the `ls12:MANUAL` line): in the Preview panel import the files, pick `de`,
   then press Cmd-Z **once**. The whole preview should revert together. Revert, and clear nothing
   else — the check restores the store it found, but a by-hand import is yours to keep or re-import.

## What a good run looks like

`Run LS-12 preview check` prints `ls12:` lines to the main-thread console, then
`LS-12 check complete — N passed, 0 failed`:

- `ls12:copy-stamp:PASS` — the run-time `clone()` of `title` carries its stamp.
- `ls12:census …` — text node and owner counts, how many copies of `title` there are (the run's
  own, plus any made by hand), and whether the missing-font row exists.
- `ls12:apply-de:PASS` — `title`, `cta` and `inst` read their German values.
- `ls12:apply-de-fallback:PASS`, `ls12:apply-de-copy:PASS` — the fallback and every copy are unchanged.
- `ls12:apply-de-every-layer:PASS` — every layer on the page reads German or its source text.
- `ls12:apply-de-unmatched:PASS [checkout.old]` — the stray key, and nothing else.
- `ls12:blocked-mixed:PASS reason=mixed-font-char-mutation`,
  `ls12:blocked-missing-font:PASS reason=missing-font` — blocked, and their text unchanged.
- `ls12:blocked-exact:PASS` — nothing else is blocked: exactly `mixed`, plus `missing-font` when
  that row exists.
- `ls12:switch-fr:PASS` — `title` reads "Bon retour", `cta` "Ajouter au panier", no German left.
- `ls12:switch-fr-every-layer:PASS` — every layer reads French or its source text.
- `ls12:revert:PASS` — every text layer byte-identical to the baseline.
- `ls12:edit-write:PASS`, `ls12:edit-delete:PASS`, `ls12:edit-fallback:PASS` — an edit changes
  exactly one layer and is stored, deleting it returns the source, and a first value writes a
  fallback layer.
- `ls12:storage:PASS` — the store round-trips `clientStorage`, and the file id is stable.
- `ls12:undo:PASS apply=1 switch=2 edit-write=1 edit-delete=1 edit-first=1` — one `commitUndo` per
  apply from a reverted canvas, two for a switch that had something to restore (restore, then
  apply), one per edit. If the runtime refuses to patch `figma.commitUndo`, this is a `SKIP` and the
  manual Cmd-Z step carries it.
- `ls12:cleanup:PASS` — the canvas is reverted, the run-time copy is removed, and the user's store
  is back as it was found. If the file had no LocaleSync file id before the run, the id and the
  store entry are removed again.

A `SKIP` is not a pass. `ls12:blocked-missing-font:SKIP` means step 2 wasn't done. Without step 2,
`apply-de-unmatched` also expects `preview.missing_font`, because no layer owns it.
