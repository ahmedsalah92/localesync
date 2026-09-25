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

/**
 * The path separator a key is nested on — i18next's default `keySeparator`, which LS-6's JSON export
 * splits on whatever the scheme. Slugs never contain it, so a `snake` key is a single segment with no
 * ancestor paths, and prefix collisions exist only under `dot`.
 */
const PATH = '.';

/**
 * The keys claimed so far in one pass, and every ancestor path of each (rule 6, LS-26).
 *
 * `home.title.sub` reserves the key itself and the branch paths `home` and `home.title`. Branches are
 * tracked separately from keys because they are taken differently: a new key may not BE a branch
 * (`home.title` would be both a string and an object in nested JSON), but a new key may sit UNDER one
 * — a branch is a namespace other keys share, not a claim.
 */
export class ReservedKeys {
	private readonly keys = new Set<string>();
	private readonly branches = new Set<string>();

	constructor(keys: Iterable<string> = []) {
		for (const key of keys) this.add(key);
	}

	add(key: string): void {
		this.keys.add(key);
		for (let i = key.indexOf(PATH); i !== -1; i = key.indexOf(PATH, i + 1)) this.branches.add(key.slice(0, i));
	}

	/** Whether `key` itself is claimed. */
	has(key: string): boolean {
		return this.keys.has(key);
	}

	/** Whether `path` is a strict ancestor path of some claimed key. */
	hasBranch(path: string): boolean {
		return this.branches.has(path);
	}
}

/** `segment` when `isFree`, else the first free of `${segment}_2`, `${segment}_3`, … */
function suffixed(segment: string, isFree: (candidate: string) => boolean): string {
	if (isFree(segment)) return segment;
	let n = 2;
	while (!isFree(`${segment}_${n}`)) n++;
	return `${segment}_${n}`;
}

/**
 * `base` when free in `reserved`, else suffixed `_2`, `_3`, … at the segment where it collides. Pure;
 * does not mutate `reserved`.
 *
 * A candidate is taken when it (a) equals a reserved key, (b) is an ancestor path of one, or (c) has
 * one as an ancestor path — (b) and (c) are the two directions of a prefix collision, which nested
 * JSON cannot represent (LS-6 §1.2). Walked root to leaf:
 *   - each ancestor path must not be a reserved KEY (c). If it is, THAT segment is suffixed — `_N` on
 *     the leaf cannot help, since `home.title.sub_2` still nests under the key `home.title`. Being a
 *     reserved branch is fine: branches are shared;
 *   - the full key must be neither a reserved key (a) nor a reserved branch (b); the leaf is suffixed.
 * A base with no collision comes back unchanged, so a file without one is never re-keyed.
 */
export function uniqueKey(base: string, reserved: ReservedKeys): string {
	const segments = base.split(PATH);
	const leaf = segments.pop() ?? base;
	let path = '';
	const under = (segment: string): string => (path === '' ? segment : `${path}${PATH}${segment}`);
	for (const segment of segments) path = under(suffixed(segment, (s) => !reserved.has(under(s))));
	return under(suffixed(leaf, (s) => !reserved.has(under(s)) && !reserved.hasBranch(under(s))));
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
 * Judged per `.` segment, since uniqueKey may suffix an ancestor segment rather than the leaf
 * (`home.title_2.sub`, rule 6): the segment counts must match and each stored segment must derive
 * from its counterpart. A `snake` key is one segment, so this is the whole-key rule there.
 *
 * One false negative is accepted: a node stamped `list.item_2` whose layer is renamed `Item 2` →
 * `Item` now derives `list.item`, and the suffix allowance masks it — likewise a frame renamed
 * `Title 2` → `Title` over a stamp `home.title_2.sub`. Drift is advisory, so this is fine. If it ever
 * matters, the exact fix is storing the pre-suffix base in the envelope and comparing against that
 * instead of stripping suffixes.
 */
export function derivesFrom(stored: string, derived: string): boolean {
	if (stored === derived) return true;
	const storedSegments = stored.split(PATH);
	const derivedSegments = derived.split(PATH);
	return (
		storedSegments.length === derivedSegments.length &&
		storedSegments.every((segment, i) => segmentDerivesFrom(segment, derivedSegments[i] ?? ''))
	);
}

/** `stored === derived`, or `stored === derived_N` for an integer N ≥ 2. */
function segmentDerivesFrom(stored: string, derived: string): boolean {
	if (stored === derived) return true;
	const prefix = `${derived}_`;
	if (!stored.startsWith(prefix)) return false;
	const suffix = stored.slice(prefix.length);
	return /^[1-9][0-9]*$/.test(suffix) && Number(suffix) >= 2;
}
