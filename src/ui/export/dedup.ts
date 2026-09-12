// src/ui/export/dedup.ts — the opt-in export-only dedup transform (docs/specs/LS-6.md §2.4).
import type { ExtractedString } from '../../common/models';
import type { KeyMapEntry } from './types';

/**
 * Collapse identical values to their first occurrence.
 *
 * Grouping is **exact value equality** — the same rule `occurrenceCounts` (LS-9,
 * src/ui/extract/state.ts) already implements, so the `N×` marker on an Extract row predicts
 * exactly what this collapses. No trimming, no case folding and **no Unicode normalisation**:
 * `Café` precomposed and `Cafe` + U+0301 render identically but are different strings and must not
 * merge (§2.4.18, fixture cases 29/30), and `'Save '` stays out of the `'Save'` group on one
 * trailing space (case 36).
 *
 * The survivor is the **first member in document order** (§2.4.20). A `Map` keyed by value gives
 * that for free — first insertion wins — and makes the choice independent of iteration accidents.
 *
 * Node identity on canvas is untouched; this only shapes the exported file (§2.4.22).
 */
export function applyDedup(entries: readonly ExtractedString[]): {
	entries: ExtractedString[];
	keyMap: KeyMapEntry[];
} {
	const survivorByValue = new Map<string, ExtractedString>();
	const kept: ExtractedString[] = [];
	const keyMap: KeyMapEntry[] = [];

	for (const entry of entries) {
		const survivor = survivorByValue.get(entry.value);
		if (survivor === undefined) {
			survivorByValue.set(entry.value, entry);
			kept.push(entry);
			continue;
		}
		// Collapsed: the file will carry the survivor's key, so record the trace back to this node.
		keyMap.push({ nodeId: entry.nodeId, from: entry.key, to: survivor.key, reason: 'dedup' });
	}

	return { entries: kept, keyMap };
}
