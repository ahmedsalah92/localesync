# Figma Community listing: LocaleSync (LS-16)

The copy and assets to paste into Figma's plugin publish form. It leads with overflow QA and the
specific mechanism, as LS-16 requires, not with export or a generic "QA early" line. Every claim is
backed by the shipped plugin: the manifest, the code, or `docs/design.md`. Check each field against
the character limits the form shows; the form is the authority on limits, not this file.

## Name

LocaleSync

## Tagline

Overflow QA for every locale: find the text that breaks its real container, not just its own box.

## Description

**It fits. It's still broken.**

A naive bounds check asks whether text exceeds its own box, and a Hug layer never does. So German,
Finnish and Arabic strings pass the check and still escape the frame they sit in. LocaleSync measures
every text layer against its real container, and it handles Hug and Fixed layers differently, because
they fail differently.

**Find what actually breaks**
- Scan the whole page or just your selection, against a target language.
- Four clear verdicts: Overflows, Clips, Fits, Un-measurable. Layers with missing fonts are flagged,
  never guessed.
- Results stream in as they are found. Jump to any layer before the scan finishes, and stop at any
  point without losing what was found.

**Stress-test before real translations arrive**
- Preview a locale in place: import translations (JSON or CSV) and see the break where it happens.
  Edit a translation inline.
- Pseudo-localize with +30%, +40% or +50% expansion, with optional accents and markers.
- Mirror the layout to RTL and re-measure.
- Every canvas change reverts in one click, and Cmd-Z undoes it in one step.

**Hand off the strings**
- Extract every string with an i18n key built from where it sits, e.g. `auth.signin.button`.
- Export to JSON, iOS `Localizable.strings` or Android `strings.xml`.

**Private by design.** LocaleSync is free and runs entirely inside Figma. Its network access is set
to none, so it can't send your data anywhere.

**LocaleSync Pro** is in the works: scan all languages at once, export QA reports, translate with AI,
and sync with your team. Join the waitlist from the plugin, or at localesync.dev/waitlist.

## Tags

Pick the ones the form offers, in this order of priority:

localization, i18n, translation, overflow, text overflow, QA, pseudo-localization, RTL, strings, export,
design QA, handoff

## Assets (Figma file `UlcEw6zdZzpIpxqrBz4X53`, page `372:5`)

| Asset | Node | Notes |
|---|---|---|
| Cover (1920×1080) | `372:6` | Shows the naive-tool-fails case: "naive bounds check: Fits" next to "localesync: Overflows", plus the German button escaping its frame. This covers LS-16's "engine depth made visible" criterion. |
| Icon (128×128) | `462:1480` | Must read on both light and dark window chrome (design.md, Shell framing convention). |
| Carousel 01–07 | `464:1504`, `464:1783`, `464:1888`, `464:2012`, `464:2130`, `464:2258`, `693:2449` | Scan, in-flight, preview, pseudo-loc, RTL, extract, export. |

## Before submitting (LS-16 success criteria)

1. **The waitlist is live**: `https://localesync.dev/waitlist` answers 200 for all four
   `utm_content` values, and the plugin's `WAITLIST_URL` is committed to match (`npm run check:release`
   passes).
2. **The production build opens in Figma desktop**: run `npm run build`, import `dist/manifest.json`,
   open the plugin, and run one real action (a scan). Not `npm run dev`.
3. **No "coming soon" text anywhere in the plugin**: the Pro stubs name their real action (reworded
   in LS-16), and a test enforces it.
4. **Creator profile** is set up in Figma.
5. **Umami** shows a visit with `utm_source=figma` after clicking a Pro stub in the production build.
