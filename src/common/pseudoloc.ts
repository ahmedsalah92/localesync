// src/common/pseudoloc.ts — the pseudo-loc transform. Pure: no `figma`, no DOM, no bridge.
//
// Lives in `common` because BOTH threads need it (agent-guidelines §1: common is the one place both
// sides can import). Main applies it to canvas in `src/main/pseudoloc`; the UI runs the identical
// function to preview each row without a round trip. It was in `src/main/overflow/expand.ts` until
// LS-10 needed the UI half — a main-thread module cannot be pulled into the UI bundle, and the
// alternative was a second copy of the transform, which LS-8 §1 exists to prevent.
//
// `expand.ts` keeps the language/band MEASUREMENT model and imports `padToLength` from here, so the
// two paths still share one padding implementation and LS-8's verdicts cannot drift from LS-10's.
import type { AccentStyle, BoundaryMarker, PseudoLocOptions } from './models';

// Band 1–2 sources pad as one unbroken token (LS-8 §2): the compound-noun case is the dominant
// one, and padding a button label with spaces fakes a wrap the real translation will not have.
const SINGLE_TOKEN_MAX_CHARS = 20;

/** Deterministic banded padding to an exact target length. No randomness anywhere. */
export function padToLength(source: string, targetLength: number): string {
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

/** `partial` is the five vowels only, so `full` is a strict superset (LS-10 §2.2). */
const PARTIAL_ACCENT_MAP: Readonly<Record<string, string>> = {
	a: 'á',
	e: 'é',
	i: 'í',
	o: 'ó',
	u: 'ú',
	A: 'Á',
	E: 'É',
	I: 'Í',
	O: 'Ó',
	U: 'Ú',
};

function accentize(text: string, style: AccentStyle): string {
	if (style === 'none') return text;
	const map = style === 'full' ? ACCENT_MAP : PARTIAL_ACCENT_MAP;
	let out = '';
	for (const ch of text) out += map[ch] ?? ch;
	return out;
}

/**
 * Interpolation tokens, treated as opaque by `transform` (LS-10 §2.10). Capturing, so `split`
 * returns tokens at the odd indices and literal runs at the even ones.
 *
 * A bare `%` is deliberately NOT a token — `%1$s got 50% off` must protect the specifier while
 * leaving `50%` as ordinary literal text and as padding material. Widening this to `%` alone would
 * silently shrink the padding material of every string containing a percentage.
 */
const PLACEHOLDER = /(\{\{[^}]*\}\}|\{\d+\}|%\d+\$s|%[@s])/g;

const MARKERS: Readonly<Record<BoundaryMarker, (body: string) => string>> = {
	none: (body) => body,
	single: (body) => `[${body}]`,
	// Inner spaces are the canvas's, not decoration: `[[ Šîgñ îñ … ]]` (LS-10 §2.3).
	double: (body) => `[[ ${body} ]]`,
};

/**
 * Deterministic pseudo-loc transform. Shared surface: LS-10 drives it with user-chosen options.
 *
 * Placeholders survive byte-identically: the source is split on `PLACEHOLDER`, only the literal
 * runs are accented, and padding is drawn only from literal words. Accenting `{{count}}` into
 * `{{çóúñt}}` would make a pseudo-loc artefact indistinguishable from a genuinely broken
 * placeholder, which is the thing the panel exists to reveal (LS-6's preserve-not-generate, applied
 * to the canvas).
 *
 * The padding TARGET still spans the whole source, placeholders included — they occupy real width —
 * while the padding MATERIAL comes only from literals. A source with no literal characters
 * (`"{{count}}"`) therefore gets markers and no padding: there is nothing to pad with, and
 * inventing material would mean generating a placeholder-like string (§2.11).
 */
export function transform(source: string, options: PseudoLocOptions): string {
	if (source.length === 0) return '';

	const segments = source.split(PLACEHOLDER);
	const literalWords = segments
		.filter((_, index) => index % 2 === 0)
		.join(' ')
		.split(/\s+/)
		.filter((word) => word.length > 0);

	const ratio = 1 + Math.max(0, options.expansionPct) / 100;
	const deficit = Math.ceil(source.length * ratio) - source.length;

	let pad = '';
	if (deficit > 0 && literalWords.length > 0) {
		if (source.length <= SINGLE_TOKEN_MAX_CHARS || literalWords.length <= 1) {
			// Single-token path: no added break opportunities (the LS-8 §2 compound-noun case).
			const material = literalWords.join('');
			while (pad.length < deficit) pad += material;
		} else {
			for (let i = 0; pad.length < deficit; i++) pad += ` ${literalWords[i % literalWords.length] ?? ''}`;
		}
		// Trailing whitespace is trimmed AFTER slicing: the phrase path prepends a space per word, so
		// an exact-deficit slice can end on one and put a double space inside the markers (§2.11a).
		pad = pad.slice(0, deficit).replace(/\s+$/, '');
	}

	const body =
		segments.map((seg, index) => (index % 2 === 1 ? seg : accentize(seg, options.accent))).join('') +
		accentize(pad, options.accent);
	return MARKERS[options.markers](body);
}

