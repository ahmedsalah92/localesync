// src/main/overflow/expand.test.ts — pure unit tests (no `figma`, no DOM).
import { describe, expect, it } from 'vitest';
import measured from '../../../fixtures/expansion-p90.json';
import {
	DEFAULT_LANGUAGE_FACTOR,
	LANGUAGE_FACTORS,
	LENGTH_BANDS,
	UNSUPPORTED_LANGUAGES,
	expandForLanguage,
	expansionRatio,
	isUnsupportedLanguage,
	normalizeLanguageTag,
} from './expand';

// LS-8 §3 pass-2 sources (43 / 20 chars); the 34-char compound has no spaces by construction.
const SENTENCE = 'Your changes have been saved automatically.';
const LABEL = 'Continue to checkout';
const COMPOUND = 'Donaudampfschifffahrtsgesellschaft';

const countSpaces = (s: string): number => (s.match(/ /g) ?? []).length;

describe('expansionRatio', () => {
	// Band boundaries exact at 10/20/30/50/70 chars. `tlh` is not in the table, so it resolves to
	// DEFAULT_LANGUAGE_FACTOR — no real language sits at exactly 1.0 since the LS-23 recalibration.
	it.each([
		[1, 2.04],
		[10, 2.04],
		[11, 1.73],
		[20, 1.73],
		[21, 1.61],
		[30, 1.61],
		[31, 1.49],
		[50, 1.49],
		[51, 1.41],
		[70, 1.41],
		[71, 1.37],
		[200, 1.37],
	])('length %i → ratio %d at factor 1.0', (len, ratio) => {
		expect(expansionRatio(len, 'tlh')).toBeCloseTo(ratio, 10);
	});

	it('reproduces the short-string anchor: 4 chars in German', () => {
		expect(expansionRatio(4, 'de')).toBeCloseTo(2.0712, 4);
	});

	it('reproduces the long-string anchor: 80 chars in German', () => {
		expect(expansionRatio(80, 'de')).toBeCloseTo(1.3811, 4);
	});

	it('falls back to factor 1.0 for an unknown language', () => {
		expect(DEFAULT_LANGUAGE_FACTOR).toBe(1.0);
		expect(expansionRatio(4, 'tlh')).toBeCloseTo(1 + (LENGTH_BANDS[0]?.growth ?? 0), 10);
	});

	// A regional tag must resolve to its primary subtag's factor, not silently to the European
	// average — 'fr-CA' at 1.0 instead of 1.13 under-reports the most expansive language in the set.
	it.each([
		['fr-FR', 'fr'],
		['de-AT', 'de'],
		['PT-br', 'pt'],
	])('%s resolves to the same factor as %s', (regional, primary) => {
		expect(expansionRatio(30, regional)).toBeCloseTo(expansionRatio(30, primary), 10);
	});

	it('still falls back to DEFAULT_LANGUAGE_FACTOR for an unknown regional tag', () => {
		expect(expansionRatio(30, 'tlh-Latn')).toBeCloseTo(1 + (LENGTH_BANDS[2]?.growth ?? 0), 10);
	});
});

/**
 * The calibration guard (LS-23). Every other test here restates the shipped table, so none of them
 * can tell a well-calibrated table from a badly-calibrated one — they only catch accidental edits.
 *
 * This one asserts the shipped values against `fixtures/expansion-p90.json`: the 90th-percentile
 * growth actually observed across 144,812 professionally-translated UI string pairs. If someone
 * changes a band value or a language factor, this fails unless the change is still consistent with
 * the measurement. Method and provenance: `docs/expansion-calibration.md`.
 */
describe('calibration against measured translation data', () => {
	// Any length inside each band; growth is constant within a band.
	const PROBE_LENGTH = [5, 15, 25, 40, 60, 100];
	const observed = measured.observedP90 as Readonly<Record<string, readonly number[]>>;

	/** Shipped prediction minus observed p90, for every (locale, band) cell. */
	const residuals = (): number[] =>
		Object.entries(observed).flatMap(([locale, growths]) =>
			growths.map((growth, band) => expansionRatio(PROBE_LENGTH[band] ?? 0, locale) - (1 + growth)),
		);

	it('records the sample it is asserting against', () => {
		expect(measured.targetPercentile).toBe(90);
		expect(measured.pairs).toBeGreaterThan(100_000);
		expect(measured.corpora).toEqual(['gnome', 'kde', 'gimp']);
		// Every calibrated language must appear in the measurement — no unmeasured entries.
		expect(Object.keys(observed).sort()).toEqual(Object.keys(LANGUAGE_FACTORS).sort());
		expect(measured.bands).toHaveLength(LENGTH_BANDS.length);
	});

	// One band table x one scalar factor cannot fit all 12 languages exactly; these bounds are the
	// residual budget of that rank-1 approximation, not a free tolerance. Tightening them is only
	// possible with per-language band tables, which LS-23 deliberately left out of scope.
	it('predicts observed p90 growth within the rank-1 residual budget', () => {
		const worst = Math.max(...residuals().map(Math.abs));
		expect(worst).toBeLessThanOrEqual(0.25);
	});

	it('is close on average, not merely within the worst-case bound', () => {
		const errs = residuals().map(Math.abs);
		expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThanOrEqual(0.08);
	});

	/**
	 * Non-vacuity: the bounds above have to be able to FAIL, or they assert nothing.
	 *
	 * Re-runs the identical check against the superseded pre-LS-23 table. It must breach the bound
	 * — which it does badly, because it reserved 1.8x growth for Finnish short strings where the
	 * measurement says 1.0x.
	 */
	it('rejects the pre-LS-23 table it replaced', () => {
		const OLD_GROWTH = [1.5, 0.9, 0.7, 0.5, 0.35, 0.3];
		const OLD_FACTORS: Record<string, number> = {
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
		const oldWorst = Math.max(
			...Object.entries(observed).flatMap(([locale, growths]) =>
				growths.map((growth, band) => Math.abs((OLD_GROWTH[band] ?? 0) * (OLD_FACTORS[locale] ?? 0) - growth)),
			),
		);
		expect(oldWorst).toBeGreaterThan(0.25);
	});
});

describe('normalizeLanguageTag', () => {
	it.each([
		['fr-FR', 'fr'],
		['ZH-Hant', 'zh'],
		['de', 'de'],
		['JA', 'ja'],
		['', ''],
	])('%s → %s', (tag, expected) => {
		expect(normalizeLanguageTag(tag)).toBe(expected);
	});
});

describe('UNSUPPORTED_LANGUAGES', () => {
	it('refuses exactly the Phase-1 CJK/Thai set', () => {
		expect(new Set(UNSUPPORTED_LANGUAGES)).toEqual(new Set(['ja', 'ko', 'zh', 'zh-Hans', 'zh-Hant', 'th']));
	});
});

describe('isUnsupportedLanguage', () => {
	// The regional-tag hole is the point of these cases: exact-match `.has()` let 'ja-JP' and
	// 'zh-TW' past the refusal and hand them confident pixel verdicts from a character-count model
	// that is wrong for those scripts (LS-8.2 §1.1.3).
	it.each(['ja', 'ja-JP', 'JA', 'zh', 'zh-TW', 'zh-Hans', 'ZH-HANT', 'ko-KR', 'th-TH', 'th'])(
		'%s is refused',
		(tag) => {
			expect(isUnsupportedLanguage(tag)).toBe(true);
		},
	);

	it.each(['de', 'de-AT', 'fr-FR', 'es', 'ar', 'he', 'tlh', ''])('%s is measured', (tag) => {
		expect(isUnsupportedLanguage(tag)).toBe(false);
	});
});

describe('expandForLanguage', () => {
	it('pads to exactly ceil(len × ratio)', () => {
		// 4 × 2.0712 = 8.28 → 9; 43 × 1.5047 = 64.70 → 65.
		expect(expandForLanguage('Save', 'de')).toHaveLength(9);
		expect(expandForLanguage(SENTENCE, 'de')).toHaveLength(65);
	});

	it('pads sources ≤ 20 chars as one token with zero spaces added', () => {
		const short = expandForLanguage('Save', 'de');
		expect(short).toBe('SaveSaveS');
		// A ≤ 20-char source with its own spaces keeps them, but the padding adds none.
		const label = expandForLanguage(LABEL, 'de'); // 20 × 1.7519 = 35.04 → 36
		expect(label).toHaveLength(36);
		expect(label.startsWith(LABEL)).toBe(true);
		expect(countSpaces(label)).toBe(countSpaces(LABEL));
	});

	it('pads sources > 20 chars by cycling the source words, space-separated', () => {
		const out = expandForLanguage(SENTENCE, 'de');
		expect(out.startsWith(`${SENTENCE} Your`)).toBe(true);
	});

	it('keeps a space-free long source as one token', () => {
		const out = expandForLanguage(COMPOUND, 'de'); // 34 × 1.5047 = 51.16 → 52
		expect(out).toHaveLength(52);
		expect(out).not.toMatch(/\s/);
	});

	it('returns empty for an empty source', () => {
		expect(expandForLanguage('', 'de')).toBe('');
	});

	it('is deterministic: same input twice → identical output', () => {
		expect(expandForLanguage(SENTENCE, 'fi')).toBe(expandForLanguage(SENTENCE, 'fi'));
	});

	/**
	 * The no-regression guard for LS-10 §1.3. `transform` was rewritten for placeholder protection
	 * and enum options, and it shares `padToLength` with this function — the overflow measurement
	 * path. If these values move, LS-8's verdicts move with them, and the hero feature's numbers
	 * would shift for a reason unrelated to pseudo-loc.
	 *
	 * **Rebaselined by LS-23.** The strings below are shorter than the ones this guard originally
	 * pinned, because the band table and language factors were recalibrated against measured
	 * translation data — a deliberate, recorded change to the model, which is exactly the kind of
	 * change that is allowed to move them. What the guard still forbids is these values moving as a
	 * side effect of work on `transform` or `padToLength`, which is what it was built to catch.
	 * Regenerate only alongside a calibration change, never to make a failing test pass.
	 */
	it('is unchanged by the LS-10 transform rewrite', () => {
		expect(expandForLanguage('Extract', 'de')).toBe('ExtractExtractE');
		expect(expandForLanguage('Save', 'de')).toBe('SaveSaveS');
		expect(expandForLanguage('Add to cart', 'fr')).toBe('Add to cartAddtocartA');
		expect(expandForLanguage('Password must be at least 8 characters', 'de')).toBe(
			'Password must be at least 8 characters Password must be at',
		);
		// A placeholder-bearing source is NOT protected on the measurement path: the candidate is
		// about rendered width, and protecting it here would change LS-8's verdicts.
		expect(expandForLanguage('You have {{count}} items', 'de')).toBe('You have {{count}} items You have {{coun');
	});
});
