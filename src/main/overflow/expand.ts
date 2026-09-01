// src/main/overflow/expand.ts — pure expansion model (no figma access, no bridge import).
//
// The single pseudo-loc implementation in the codebase (LS-8 §1): LS-10 imports `transform`
// rather than writing a second one; further options expand `PseudoLocOptions` and `transform`
// in place. The overflow path uses `expandForLanguage` — banded ratio, accent and brackets off.
import type { PseudoLocOptions } from '../../common/models';

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
 *  character-count candidate wrong on rendered width — honest refusal beats a wrong verdict). */
export const UNSUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(['ja', 'ko', 'zh', 'zh-Hans', 'zh-Hant', 'th']);

/** ratio = 1 + bandGrowth(source.length) × languageFactor(language). Pure, deterministic. */
export function expansionRatio(sourceLength: number, language: string): number {
	const growth = LENGTH_BANDS.find((band) => sourceLength <= band.maxChars)?.growth ?? FINAL_BAND_GROWTH;
	const factor = LANGUAGE_FACTORS[language] ?? DEFAULT_LANGUAGE_FACTOR;
	return 1 + growth * factor;
}

// Band 1–2 sources pad as one unbroken token (LS-8 §2): the compound-noun case is the dominant
// one, and padding a button label with spaces fakes a wrap the real translation will not have.
const SINGLE_TOKEN_MAX_CHARS = 20;

/** Deterministic banded padding to an exact target length. No randomness anywhere. */
function padToLength(source: string, targetLength: number): string {
	if (targetLength <= source.length) return source;
	const words = source.split(/\s+/).filter((word) => word.length > 0);
	if (source.length <= SINGLE_TOKEN_MAX_CHARS || words.length <= 1) {
		// Append the source's own characters, spaces stripped — zero added break opportunities.
		const padChars = words.join('') || source;
		let out = source;
		while (out.length < targetLength) out += padChars;
		return out.slice(0, targetLength);
	}
	// Phrase path: cycle the source's own words so wrap behaviour and character distribution
	// track the real string.
	let out = source;
	for (let i = 0; out.length < targetLength; i++) {
		out += ` ${words[i % words.length] ?? ''}`;
	}
	return out.slice(0, targetLength);
}

// Accented replacements are single code points, so accenting never changes string length —
// diacritics add visual noise for LS-10's on-canvas check, not advance width (LS-8 §2).
const ACCENT_MAP: Readonly<Record<string, string>> = {
	a: 'á',
	c: 'ç',
	e: 'é',
	i: 'í',
	n: 'ñ',
	o: 'ó',
	u: 'ú',
	y: 'ý',
	A: 'Á',
	C: 'Ç',
	E: 'É',
	I: 'Í',
	N: 'Ñ',
	O: 'Ó',
	U: 'Ú',
	Y: 'Ý',
};

function accentize(text: string): string {
	let out = '';
	for (const ch of text) out += ACCENT_MAP[ch] ?? ch;
	return out;
}

/** Deterministic pseudo-loc transform. Shared surface: LS-10 drives it with user-chosen options. */
export function transform(source: string, options: PseudoLocOptions): string {
	if (source.length === 0) return '';
	const ratio = 1 + Math.max(0, options.expansionPct) / 100;
	let out = padToLength(source, Math.ceil(source.length * ratio));
	if (options.accent) out = accentize(out);
	if (options.brackets) out = `[${out}]`;
	return out;
}

/** Overflow-path wrapper: banded ratio, accent and brackets off.
 *  Throws nothing — callers must check UNSUPPORTED_LANGUAGES first. */
export function expandForLanguage(source: string, language: string): string {
	if (source.length === 0) return '';
	const ratio = expansionRatio(source.length, language);
	return padToLength(source, Math.ceil(source.length * ratio));
}
