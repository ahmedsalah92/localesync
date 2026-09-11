// src/main/extract/persist.ts — OWNED by LS-9. Main thread.
//
// Split deliberately: the envelope codec is pure and unit-testable; only the two thin wrappers touch
// a live node. Plugin data is inert — no layout, no font load, no prior value to restore — so none
// of this is LS-4 territory and nothing here goes through withSnapshot (LS-9 §2.16).
import type { KeyScheme } from './key';

export const KEY_DATA = 'localesync:key:v1'; // ':v1' carries the format version

export interface StoredKey {
	k: string; // the key
	s: KeyScheme; // which scheme derived it
	n: string; // owning node id at stamp time
	// Date.now() at stamp time — the tiebreak when two nodes own one key (./resolve). Optional, and
	// additive rather than a format bump: stamps written before this field existed are strictly older
	// than any stamp carrying it. `0` is a real value, not "absent": it is what adopting a pre-`t`
	// stamp writes. Compare against `undefined` explicitly; never test `t` for truthiness.
	t?: number;
}

/** A stamp as written. Every write carries `t`; only a stamp read back may lack it. */
export type Stamp = Required<StoredKey>;

function isKeyScheme(value: unknown): value is KeyScheme {
	return value === 'dot' || value === 'snake';
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/** Pure. Malformed, empty or shape-wrong input → null. Never throws. An absent `t` is not
 *  shape-wrong — it is a pre-`t` stamp — and comes back as `undefined`. */
export function parseStoredKey(raw: string): StoredKey | null {
	if (raw === '') return null; // getPluginData's "nothing stored"
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const { k, s, n, t } = parsed as Record<string, unknown>;
	if (!isNonEmptyString(k) || !isKeyScheme(s) || !isNonEmptyString(n)) return null;
	if (t === undefined) return { k, s, n };
	if (typeof t !== 'number' || !Number.isFinite(t)) return null;
	// Rebuilt rather than returned as parsed, so unknown fields from a future writer never ride along.
	return { k, s, n, t };
}

/** Pure. Inverse of parseStoredKey. Always writes `t` — the type requires it. */
export function serializeStoredKey(stored: Stamp): string {
	return JSON.stringify({ k: stored.k, s: stored.s, n: stored.n, t: stored.t });
}

/** Thin wrapper over getPluginData + parseStoredKey. */
export function readStoredKey(node: TextNode): StoredKey | null {
	try {
		return parseStoredKey(node.getPluginData(KEY_DATA));
	} catch {
		return null;
	}
}

/** Returns false when Figma rejects the write (read-only subtree). Never throws —
 *  a rejected stamp cannot fail an extraction pass. */
export function writeStoredKey(node: TextNode, stored: Stamp): boolean {
	const value = serializeStoredKey(stored);
	try {
		node.setPluginData(KEY_DATA, value);
		// TEMPORARY, tied to LS-9 §3.4 probes 1–3. Whether Figma throws or silently drops a write on an
		// instance child, a published-library instance child or a locked node is unpinned; reading back
		// makes both failure shapes land on the same `false`. It doubles plugin-data ops on a first scan
		// (~2k extra reads on a large file, LS-15), so once the probes pin write rejection as throwing,
		// this collapses to the try/catch alone.
		return node.getPluginData(KEY_DATA) === value;
	} catch {
		return false;
	}
}
