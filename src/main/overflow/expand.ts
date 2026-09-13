// src/main/overflow/expand.ts — pure expansion model (no figma access, no bridge import).
//
// The language/band MEASUREMENT model. `expandForLanguage` is the overflow path: banded ratio, no
// accent, no markers.
//
// The pseudo-loc transform itself moved to `src/common/pseudoloc.ts` when LS-10 needed to run the
// identical function UI-side to preview rows — a main-thread module cannot be pulled into the UI
// bundle. It is still ONE implementation (LS-8 §1), and both paths still share `padToLength`
// imported from there, so LS-8's candidates and LS-10's output cannot drift apart.
import { padToLength } from '../../common/pseudoloc';

// Expansion is a function of source length first and language second (IBM/W3C model, LS-8 §2):
// short strings reserve proportionally more room. `expansionRatio` is the single calibration edit
// point.
//
// **Both tables below are measured, not assumed (LS-23).** They were fitted to the 90th percentile
// of observed growth across 144,812 professionally-translated UI string pairs — GNOME, KDE and GIMP
// catalogues, 12 locales — recorded in `fixtures/expansion-p90.json` with the method and full
// results in `docs/expansion-calibration.md`. p90 means a flagged string is one that overflows in
// the worst 10% of plausible phrasings.
//
// They replace the midpoints of the published IBM/W3C ranges, which were design-RESERVE guidance
// ("how much room should a designer leave for any language, in any wording") used as a per-string
// predictor. That over-flagged by construction: the old band 1 built a candidate 2.36x longer than
// the real German translation, while the old final band sat BELOW observed growth and quietly
// missed real overflow. The error was in the table's slope, not its level.
//
// Bands and factors were fitted TOGETHER (a rank-1 fit of the p90 grid): fitting bands first would
// have baked the old, wrong factors into the new band values.
const FINAL_BAND_GROWTH = 0.37;

/** Growth fraction by source length band. Fitted to observed p90 growth — see above. */
export const LENGTH_BANDS: readonly { maxChars: number; growth: number }[] = [
	{ maxChars: 10, growth: 1.04 },
	{ maxChars: 20, growth: 0.73 },
	{ maxChars: 30, growth: 0.61 },
	{ maxChars: 50, growth: 0.49 },
	{ maxChars: 70, growth: 0.41 },
	{ maxChars: Number.POSITIVE_INFINITY, growth: FINAL_BAND_GROWTH },
];

/**
 * Per-language multiplier applied to band growth, fitted jointly with `LENGTH_BANDS`. Anchored so
 * the European factors have geometric mean 1.0, which is what `DEFAULT_LANGUAGE_FACTOR` relies on.
 *
 * Two corrections here are large and counter-intuitive, and both replicate across all three corpora:
 *
 * - **French (0.95 -> 1.13) and Finnish (1.20 -> 0.83) swap ends of the table.** Measured on total
 *   character count, French is the *most* expansive language in the set and Finnish one of the
 *   least. German's reputation is real but lives in the longest unbreakable TOKEN (+129% at p90,
 *   against French's +71%) — a wrapping property, not a length one. This factor multiplies total
 *   length, the one quantity where German is the milder of the two, so applying the folklore here
 *   was measuring the wrong thing. See `docs/expansion-calibration.md` and LS-27.
 * - **Hebrew and Arabic drop to ~0.3.** Their translations are barely longer than English, and in
 *   the long bands not longer at all. At 0.85 the model reserved over twice what those languages
 *   actually need.
 */
export const LANGUAGE_FACTORS: Readonly<Record<string, number>> = {
	fr: 1.13,
	ru: 1.12,
	pl: 1.04,
	de: 1.03,
	pt: 1.01,
	it: 0.98,
	es: 0.97,
	nl: 0.92,
	fi: 0.83,
	tr: 0.7,
	ar: 0.34,
	he: 0.31,
};

export const DEFAULT_LANGUAGE_FACTOR = 1.0;

/** Languages Phase 1 cannot synthesise a candidate for (LS-8 §2: CJK/Thai glyph width makes a
 *  character-count candidate wrong on rendered width — honest refusal beats a wrong verdict).
 *  Canonical casing; every match goes through `isUnsupportedLanguage`, never `.has()` directly. */
export const UNSUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(['ja', 'ko', 'zh', 'zh-Hans', 'zh-Hant', 'th']);

// Lowercased match indices, built from the exported constants so the two can never drift. The
// exports keep their canonical casing for display; matching is case-insensitive (LS-8.2 §1.1.3).
const UNSUPPORTED_INDEX: ReadonlySet<string> = new Set([...UNSUPPORTED_LANGUAGES].map((tag) => tag.toLowerCase()));

const FACTOR_INDEX: ReadonlyMap<string, number> = new Map(
	Object.entries(LANGUAGE_FACTORS).map(([tag, factor]) => [tag.toLowerCase(), factor]),
);

/** Lowercased primary subtag: 'fr-FR' → 'fr', 'ZH-Hant' → 'zh'. */
export function normalizeLanguageTag(tag: string): string {
	return (tag.split('-')[0] ?? '').toLowerCase();
}

/**
 * The single refusal check. Matches on the full tag first, then the primary subtag, both
 * case-insensitively — so 'ja-JP' and 'zh-TW' are refused, not silently measured.
 *
 * Exact-match `.has()` let any regional tag walk straight past the refusal and collect confident
 * pixel verdicts from a character-count model that is wrong for those scripts — the exact failure
 * LS-8.1 §2 refuses in order to avoid.
 */
export function isUnsupportedLanguage(tag: string): boolean {
	return UNSUPPORTED_INDEX.has(tag.toLowerCase()) || UNSUPPORTED_INDEX.has(normalizeLanguageTag(tag));
}

/**
 * ratio = 1 + bandGrowth(source.length) × languageFactor(language). Pure, deterministic.
 *
 * Factor resolves by full tag, then primary subtag, then `DEFAULT_LANGUAGE_FACTOR`, so 'de-AT'
 * gets German's 1.15 rather than silently falling back to the European average.
 */
export function expansionRatio(sourceLength: number, language: string): number {
	const growth = LENGTH_BANDS.find((band) => sourceLength <= band.maxChars)?.growth ?? FINAL_BAND_GROWTH;
	const key = language.toLowerCase();
	const factor = FACTOR_INDEX.get(key) ?? FACTOR_INDEX.get(normalizeLanguageTag(language)) ?? DEFAULT_LANGUAGE_FACTOR;
	return 1 + growth * factor;
}

/** Overflow-path wrapper: banded ratio, accent and brackets off.
 *  Throws nothing — callers must check `isUnsupportedLanguage` first, and must do so BEFORE the
 *  factor lookup here. Without that ordering a refused tag walks straight past the CJK refusal and
 *  receives a confident candidate from a character-count model that is wrong for those scripts
 *  (LS-8.2 §1.1.3). `scanOverflow`'s `supported` filter is what enforces it. */
export function expandForLanguage(source: string, language: string): string {
	if (source.length === 0) return '';
	const ratio = expansionRatio(source.length, language);
	return padToLength(source, Math.ceil(source.length * ratio));
}
