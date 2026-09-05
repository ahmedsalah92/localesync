// src/main/overflow/expand.test.ts — pure unit tests (no `figma`, no DOM).
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LANGUAGE_FACTOR,
	UNSUPPORTED_LANGUAGES,
	expandForLanguage,
	expansionRatio,
	isUnsupportedLanguage,
	normalizeLanguageTag,
	transform,
} from './expand';

// LS-8 §3 pass-2 sources (43 / 20 chars); the 34-char compound has no spaces by construction.
const SENTENCE = 'Your changes have been saved automatically.';
const LABEL = 'Continue to checkout';
const COMPOUND = 'Donaudampfschifffahrtsgesellschaft';

const countSpaces = (s: string): number => (s.match(/ /g) ?? []).length;

describe('expansionRatio', () => {
	// Band boundaries exact at 10/20/30/50/70 chars, at factor 1.0 ('es').
	it.each([
		[1, 2.5],
		[10, 2.5],
		[11, 1.9],
		[20, 1.9],
		[21, 1.7],
		[30, 1.7],
		[31, 1.5],
		[50, 1.5],
		[51, 1.35],
		[70, 1.35],
		[71, 1.3],
		[200, 1.3],
	])('length %i → ratio %d at factor 1.0', (len, ratio) => {
		expect(expansionRatio(len, 'es')).toBeCloseTo(ratio, 10);
	});

	// Spec §3 quotes the display-rounded 2.73 / 1.35; the exact values are 1 + 1.50 × 1.15 = 2.725
	// and 1 + 0.30 × 1.15 = 1.345. Downstream ceil() targets are identical either way.
	it('reproduces the short-string anchor: 4 chars in German', () => {
		expect(expansionRatio(4, 'de')).toBeCloseTo(2.725, 3);
	});

	it('reproduces the long-string anchor: 80 chars in German', () => {
		expect(expansionRatio(80, 'de')).toBeCloseTo(1.345, 3);
	});

	it('falls back to factor 1.0 for an unknown language', () => {
		expect(DEFAULT_LANGUAGE_FACTOR).toBe(1.0);
		expect(expansionRatio(4, 'tlh')).toBeCloseTo(expansionRatio(4, 'es'), 10);
	});

	// A regional tag must resolve to its primary subtag's factor, not silently to the European
	// average — 'de-AT' at 1.0 instead of 1.15 under-reports the canonical expansion case.
	it.each([
		['fr-FR', 'fr'],
		['de-AT', 'de'],
		['PT-br', 'pt'],
	])('%s resolves to the same factor as %s', (regional, primary) => {
		expect(expansionRatio(30, regional)).toBeCloseTo(expansionRatio(30, primary), 10);
	});

	it('still falls back to DEFAULT_LANGUAGE_FACTOR for an unknown regional tag', () => {
		expect(expansionRatio(30, 'tlh-Latn')).toBeCloseTo(expansionRatio(30, 'es'), 10);
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
		// 4 × 2.725 = 10.9 → 11; 43 × 1.575 = 67.725 → 68.
		expect(expandForLanguage('Save', 'de')).toHaveLength(11);
		expect(expandForLanguage(SENTENCE, 'de')).toHaveLength(68);
	});

	it('pads sources ≤ 20 chars as one token with zero spaces added', () => {
		const short = expandForLanguage('Save', 'de');
		expect(short).toBe('SaveSaveSav');
		// A ≤ 20-char source with its own spaces keeps them, but the padding adds none.
		const label = expandForLanguage(LABEL, 'de'); // 20 × 2.035 = 40.7 → 41
		expect(label).toHaveLength(41);
		expect(label.startsWith(LABEL)).toBe(true);
		expect(countSpaces(label)).toBe(countSpaces(LABEL));
	});

	it('pads sources > 20 chars by cycling the source words, space-separated', () => {
		const out = expandForLanguage(SENTENCE, 'de');
		expect(out.startsWith(`${SENTENCE} Your`)).toBe(true);
	});

	it('keeps a space-free long source as one token', () => {
		const out = expandForLanguage(COMPOUND, 'de'); // 34 × 1.575 = 53.55 → 54
		expect(out).toHaveLength(54);
		expect(out).not.toMatch(/\s/);
	});

	it('returns empty for an empty source', () => {
		expect(expandForLanguage('', 'de')).toBe('');
	});

	it('is deterministic: same input twice → identical output', () => {
		expect(expandForLanguage(SENTENCE, 'fi')).toBe(expandForLanguage(SENTENCE, 'fi'));
		expect(transform(LABEL, { expansionPct: 40, accent: true, brackets: true })).toBe(
			transform(LABEL, { expansionPct: 40, accent: true, brackets: true }),
		);
	});
});

describe('transform (LS-10 surface)', () => {
	it('pads by expansionPct with accent and brackets off', () => {
		// ceil(4 × 1.5) = 6.
		expect(transform('Save', { expansionPct: 50, accent: false, brackets: false })).toBe('SaveSa');
	});

	it('accents without changing length', () => {
		expect(transform('Save', { expansionPct: 0, accent: true, brackets: false })).toBe('Sávé');
	});

	it('brackets the result', () => {
		expect(transform('Save', { expansionPct: 0, accent: false, brackets: true })).toBe('[Save]');
	});
});
