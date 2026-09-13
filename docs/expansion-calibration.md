# Expansion calibration — measured evidence for `LENGTH_BANDS`

The measurement record behind LS-23. `docs/specs/LS-23.md` carries the decisions; this file carries
the **evidence they rest on** — the sample, the filters, the observed numbers and the fit.

Every figure here is printed by `node scripts/measure-expansion.mjs` (`--json` for machine output,
`--fixture` to regenerate `fixtures/expansion-p90.json`, `--refresh` to re-download). Catalogues
cache under `.cache/ls23-corpus/`, gitignored.

## What was tested

`src/main/overflow/expand.ts` predicts a translated string's length as
`ratio = 1 + bandGrowth(sourceLength) × languageFactor(language)`. Before LS-23 the growth values
were `1.5 / 0.9 / 0.7 / 0.5 / 0.35 / 0.3` — midpoints of the published IBM/W3C ranges, never checked
against real translations — and the language factors were folklore.

LS-23 exists because those ranges are design-*reserve* guidance ("how much room should a designer
leave for any language, in any phrasing") being used as a per-string *predictor*. A reserve answers
"is this layout safe?"; the panel promises "see which strings break their containers". Using one as
the other over-flags by construction.

## Sample and provenance

Openly-licensed gettext catalogues. A `.po` entry carries `msgid` (English source) and `msgstr`
(the professional translation) together, so pairs come pre-joined — no cross-repo key matching and
no translation budget. Three corpora, so that a finding has to replicate before it counts:

| Corpus | Apps | Why this one |
|---|---|---|
| GNOME | nautilus, gnome-calculator, gnome-text-editor, gnome-control-center, gnome-calendar, gnome-software, gnome-disk-utility, gnome-clocks, eog, gnome-weather | broad UI-string coverage |
| KDE | kate, dolphin, okular | an **independent** translator community — agreement is replication, not repetition |
| GIMP | gimp | **register control**: is a desktop-app corpus representative of a graphics/design tool? |

All twelve languages in `LANGUAGE_FACTORS`. Correcting only the two the issue named would have left
ten assumptions sitting next to two measurements in the same table.

**168 catalogues, 144,812 pairs survive filtering**, against the 50–100 the issue asked for. Fetched
2026-09-13; per-file `sha256` prefixes print on every run, so numbers that move can be traced to
changed source data rather than to drift in the script.

Rejected, from the same run: `duplicate=14053`, `placeholder=12210`, `fuzzy/plural/untranslated=11771`,
`markup=1750`, `multiline=1683`, `no-letters=694`, `over-200-chars=393`, `url-or-email=52`.

Filter rules, each present to stop a length comparison from measuring something other than
translation growth: fuzzy (unreviewed) and plural entries out; obsolete `#~` entries out; GTK
accelerator underscores stripped from both sides (`_Open` → `Open`); anything with markup, a
URL/e-mail, a newline or a tab out; **any entry containing a placeholder** out, since placeholder
length is runtime-dependent and identical in both languages, making it noise in a length ratio;
sources over 200 characters out as long-form prose; exact `(source, target)` duplicates out within
a corpus and locale.

Lengths are counted with JavaScript `String.length`, matching what `expand.ts` itself counts.

## Result 1 — observed p90 growth, and what the old table did with it

`cover%` is the share of real translations no longer than the model's old candidate; `c/a` is the
mean ratio of candidate length to actual translated length.

| Locale | n | old factor | 1–10 | 11–20 | 21–30 | 31–50 | 51–70 | 71+ | old cover% | old c/a |
|---|---|---|---|---|---|---|---|---|---|---|
| fi | 12,396 | 1.20 | 1.000 | 0.566 | 0.433 | 0.340 | 0.285 | 0.268 | 98.7 | **1.91×** |
| de | 12,535 | 1.15 | 1.000 | 0.700 | 0.645 | 0.583 | 0.509 | 0.462 | 94.6 | 1.71× |
| nl | 12,690 | 1.10 | 1.000 | 0.636 | 0.520 | 0.455 | 0.373 | 0.365 | 96.6 | 1.71× |
| pl | 12,593 | 1.05 | 1.167 | 0.750 | 0.599 | 0.488 | 0.364 | 0.356 | 95.2 | 1.69× |
| ru | 13,181 | 1.05 | 1.300 | 0.786 | 0.615 | 0.484 | 0.406 | 0.362 | 94.4 | 1.65× |
| es | 12,714 | 1.00 | 0.889 | 0.783 | 0.654 | 0.516 | 0.421 | 0.368 | 93.7 | 1.55× |
| pt | 12,263 | 0.95 | 1.000 | 0.765 | 0.663 | 0.528 | 0.414 | 0.348 | 92.5 | 1.55× |
| fr | 12,499 | 0.95 | 1.000 | 0.882 | 0.759 | 0.622 | 0.576 | 0.500 | **86.8** | 1.46× |
| it | 12,648 | 0.90 | 0.970 | 0.706 | 0.640 | 0.513 | 0.411 | 0.397 | 92.0 | 1.52× |
| he | 8,728 | 0.85 | 0.500 | 0.201 | 0.130 | 0.054 | 0.000 | 0.000 | 99.1 | **2.15×** |
| tr | 12,612 | 0.85 | 0.750 | 0.538 | 0.381 | 0.303 | 0.275 | 0.267 | 97.1 | 1.73× |
| ar | 9,953 | 0.85 | 0.571 | 0.250 | 0.132 | 0.081 | −0.037 | −0.034 | 99.3 | **2.06×** |

Three defects, and only the first was the one under suspicion:

- **Band 1 over-reserved ~2×.** For German the old model built a candidate 2.36× longer than the
  real translation; 1.5 sat between the p95 and p99 of observed growth. Band 1 applies to every
  button, tab and label, so it dominates the flag rate.
- **The last two bands *under*-reserved.** Old coverage fell to 79% (de) and 62% (fr) in band 5 —
  the model was missing real overflow on long strings. The old 0.30 sat *below* observed p90.
  The table's error was in its **slope**, not its level.
- **The factor table's ordering was wrong** (Result 3).

The band model's **shape is confirmed**: short strings really do grow proportionally more, in every
one of the twelve languages.

## Result 2 — replication holds, including across register

Band-1 p90 by corpus:

| Locale | GIMP | GNOME | KDE |
|---|---|---|---|
| de | 0.960 | 1.000 | 1.200 |
| fr | 1.000 | 1.000 | 1.200 |
| es | 0.875 | 0.800 | 1.111 |
| he | 0.362 | 0.500 | 0.429 |
| ar | 0.500 | 0.667 | 0.550 |

Two independent translator communities agree closely, and GIMP — a graphics tool, the closest
register available to a design-tool plugin — sits with the desktop apps rather than apart from them.

## Result 3 — the language factors were ordered wrongly, and German's reputation is about wrapping

The old table's top entry was Finnish (1.20) and French sat near the bottom (0.95). Measured on
**total character count**, that ordering is close to reversed: French is the *most* expansive
language in the set and Finnish one of the least.

But measuring the **longest unbreakable token** — what a fixed-width container actually breaks on —
tells the opposite story for exactly the languages the folklore is about:

| Locale | total p90 | longest-token p90 | token/total |
|---|---|---|---|
| fi | 0.565 | **1.143** | 1.37 |
| de | 0.700 | **1.286** | 1.34 |
| nl | 0.600 | **1.143** | 1.34 |
| pl | 0.722 | 0.800 | 1.05 |
| ru | 0.800 | 0.875 | 1.04 |
| it | 0.667 | 0.714 | 1.03 |
| ar | 0.273 | 0.286 | 1.01 |
| es | 0.714 | 0.667 | 0.97 |
| he | 0.231 | 0.200 | 0.97 |
| fr | 0.808 | 0.714 | 0.95 |

German, Finnish and Dutch grow their longest token roughly a third more than their total length;
French, Spanish and Hebrew do the reverse. German compounds; French is analytic and adds *more,
shorter* words.

**Both facts are true, of different quantities.** The intuition behind `de = 1.15` is sound — it was
simply attached to total character count, the one quantity where German is the milder of the pair.
This factor multiplies total length, so it is corrected against total length here; the wrapping
dimension needs a different mechanism and is filed as **LS-27**.

## Result 4 — the mean is the wrong statistic, as suspected

Band 1 German: mean 0.351, p50 0.200, p90 1.000, p95 1.433, p99 2.500, max 4.800. Heavily
right-skewed, and the tail is genuine rather than noise — `Redo` → `Wiederherstellen` (+300%),
`Home` → `Persönlicher Ordner` (+375%), `Star` → `Zu Favoriten hinzufügen` (+475%). Any single
summary statistic is a choice about which phrasings the tool should protect against; the mean would
protect against almost none of them.

## The fit

Target **p90**: a flagged string is one that overflows in the worst 10% of plausible phrasings.

Bands and factors are fitted **together**, as a rank-1 approximation of the p90 grid solved by
alternating least squares. Fitting bands first and factors afterwards would have baked the old,
wrong factors into the new band values.

Linear space rather than the obvious log-space additive fit, because Arabic and Hebrew have an
observed p90 growth of zero or slightly negative in the long bands — their translations are no
longer than the English source — and `log(0)` is undefined. That is a real property of those
languages, not bad data, so the fit has to tolerate it.

Factors are anchored so the **European** subset has geometric mean 1.0, preserving the meaning
`DEFAULT_LANGUAGE_FACTOR = 1.0` already claims.

| | old | new |
|---|---|---|
| bands | `1.50 0.90 0.70 0.50 0.35 0.30` | `1.04 0.73 0.61 0.49 0.41 0.37` |

| Locale | old factor | new factor | change |
|---|---|---|---|
| fr | 0.95 | **1.13** | +0.18 |
| ru | 1.05 | 1.12 | +0.07 |
| pl | 1.05 | 1.04 | −0.01 |
| de | 1.15 | 1.03 | −0.12 |
| pt | 0.95 | 1.01 | +0.06 |
| it | 0.90 | 0.98 | +0.08 |
| es | 1.00 | 0.97 | −0.03 |
| nl | 1.10 | 0.92 | −0.18 |
| fi | 1.20 | **0.83** | −0.37 |
| tr | 0.85 | 0.70 | −0.15 |
| ar | 0.85 | **0.34** | −0.51 |
| he | 0.85 | **0.31** | −0.54 |

### Effect

| | old | new |
|---|---|---|
| coverage spread across the 12 locales | 86.8% – 99.3% | **89.5% – 93.9%** |
| mean candidate / actual length | 1.72× | **1.47×** |
| worst-covered locale | 86.8% (fr) | **89.5%** |

Coverage *falling* in an over-reserved locale is the intended correction, not a regression: the fit
targets p90 everywhere, so Hebrew dropping from 99.1% to 93.9% is the model no longer reserving
twice what that language needs. The honest summary is that coverage becomes **consistent** — a
12.5-point spread collapses to 4.4 — while over-reservation falls everywhere.

On the issue's worked example, German `"Extract"` (real translation `Extrahieren`, 11 chars), the
candidate goes from **20 characters to 15**.

### Where the one-table model strains

Residuals (fitted minus observed p90) stay within ±0.10 for most cells. The largest are band 1 for
the outliers — `ar` −0.21, `he` −0.18, `fr` +0.18. One band table × one scalar factor cannot fit
twelve languages exactly, and LS-23 deliberately kept per-language band tables out of scope. That
±0.25 worst case is the residual budget `expand.test.ts` asserts against; it is a measured property
of the rank-1 approximation, not a tolerance chosen for convenience.

## Still open

1. **Flag rate on the LocaleSync design file has not been re-measured** against the 34% baseline.
   That needs a scan in Figma and is the remaining LS-23 success criterion.
2. `fixtures/overflow-spike.fig`'s `autoheight-maxlines` row was width-tuned to a 41-character
   candidate, now 36. The reasoning should still hold (a 24-character unbreakable token cannot fit
   140px), but only Figma can settle a layout prediction — re-check on the next LS-8 acceptance pass.
3. **LS-27** carries the wrapping dimension.
