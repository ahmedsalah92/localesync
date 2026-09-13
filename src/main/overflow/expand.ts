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
// short strings reserve proportionally more room. Growth values are the midpoint of each
// published range — the upper bound would flag nearly every button and train users to ignore
// the tool. `expansionRatio` is the single calibration edit point.
const FINAL_BAND_GROWTH = 0.3;

/** Growth fraction by source length band (IBM/W3C model — see LS-8 §2). */
export const LENGTH_BANDS: readonly { maxChars: number; growth: number }[] = [
	{ maxChars: 10, growth: 1.5 },
	{ maxChars: 20, growth: 0.9 },
	{ maxChars: 30, growth: 0.7 },
	{ maxChars: 50, growth: 0.5 },
	{ maxChars: 70, growth: 0.35 },
	{ maxChars: Number.POSITIVE_INFINITY, growth: FINAL_BAND_GROWTH },
];

/** Per-language multiplier applied to band growth. 1.0 = European average. */
export const LANGUAGE_FACTORS: Readonly<Record<string, number>> = {
	fi: 1.2,
	de: 1.15,
	nl: 1.1,
	pl: 1.05,
	ru: 1.05,
	es: 1.0,
	pt: 0.95,
	fr: 0.95,
	it: 0.9,
	he: 0.85,
	tr: 0.85,
	ar: 0.85,
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
