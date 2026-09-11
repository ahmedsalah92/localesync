// src/main/extract/key.ts — OWNED by LS-9. Pure: no `figma` global, no async, no bridge import.
//
// Key derivation per LS-9 §2 rules 1–8. Vitest-covered against the §3.2 case table, transcribed to
// fixtures/extract-cases.json. The leaf is the layer NAME, never its characters: a key must survive
// a copy edit, and deriving it from content bakes the source language into a language-neutral id.
import type { TextNodeModel } from '../traversal/model';

export type KeyScheme = 'dot' | 'snake';

export const DEFAULT_SCHEME: KeyScheme = 'dot';
export const MAX_SEGMENT_CHARS = 32;
export const MAX_ANCESTORS = 3;

/** The leaf used when the layer name holds no alphanumerics (non-Latin layer names, rule 3). */
const EMPTY_LEAF = 'text';

const JOIN: Record<KeyScheme, string> = { dot: '.', snake: '_' };

/** Lowercase; each run of non-[a-z0-9] → a single '_'; trim both ends; cut to
 *  MAX_SEGMENT_CHARS on a '_' boundary. Returns '' when the name holds no
 *  alphanumerics (non-Latin layer names). */
export function slugSegment(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (slug.length <= MAX_SEGMENT_CHARS) return slug;
	// The last '_' at or before the limit. An index of exactly MAX_SEGMENT_CHARS means the first 32
	// characters already end on a word; a single unbroken word longer than the cap is hard-cut.
	const boundary = slug.lastIndexOf('_', MAX_SEGMENT_CHARS);
	return slug.slice(0, boundary > 0 ? boundary : MAX_SEGMENT_CHARS);
}

/** Leaf from `model.name`; up to MAX_ANCESTORS nearest frame ancestors emitted
 *  outermost-first. Empty ancestor segments dropped; an empty leaf becomes 'text'.
 *  Joined per scheme. No uniqueness — see uniqueKey. */
export function deriveKey(model: Pick<TextNodeModel, 'name' | 'ancestorFrameNames'>, scheme: KeyScheme): string {
	// Cap first, then drop empties: rule 5 counts the three nearest frames, and a non-Latin frame is
	// still one of them. On a deeper tree it is the OUTERMOST frame that falls off.
	const ancestors = model.ancestorFrameNames
		.slice(0, MAX_ANCESTORS)
		.reverse()
		.map(slugSegment)
		.filter((segment) => segment !== '');
	const leaf = slugSegment(model.name) || EMPTY_LEAF;
	return [...ancestors, leaf].join(JOIN[scheme]);
}

/** `base` when free in `reserved`, else `${base}_2`, `${base}_3`, … Pure; does
 *  not mutate `reserved`. */
export function uniqueKey(base: string, reserved: ReadonlySet<string>): string {
	if (!reserved.has(base)) return base;
	let n = 2;
	while (reserved.has(`${base}_${n}`)) n++;
	return `${base}_${n}`;
}

/**
 * Whether a `stored` key still matches a fresh `derived` key — the negation is drift.
 *
 * Asymmetric by design: the STAMP may carry a uniqueness suffix the derivation lacks, never the
 * reverse. `stored === derived`, or `stored === derived_N` for an integer N ≥ 2. The suffix allowance
 * exists because the second `Total` in a frame is stamped `…total_2` and re-derives to the bare
 * `…total`; without it every suffixed key would read as drifted on every scan. The reverse must stay
 * drift: renaming `Welcome` → `Welcome 2` derives `home.welcome_2` against stamp `home.welcome`, and
 * that is a genuine rename.
 *
 * One false negative is accepted: a node stamped `list.item_2` whose layer is renamed `Item 2` →
 * `Item` now derives `list.item`, and the suffix allowance masks it. Drift is advisory, so this is
 * fine. If it ever matters, the exact fix is storing the pre-suffix base in the envelope and
 * comparing against that instead of stripping suffixes.
 */
export function derivesFrom(stored: string, derived: string): boolean {
	if (stored === derived) return true;
	const prefix = `${derived}_`;
	if (!stored.startsWith(prefix)) return false;
	const suffix = stored.slice(prefix.length);
	return /^[1-9][0-9]*$/.test(suffix) && Number(suffix) >= 2;
}
