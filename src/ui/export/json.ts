// src/ui/export/json.ts — i18next JSON (docs/specs/LS-6.md §2.1).
import type { ExtractedString } from '../../common/models';
import type { OmittedEntry } from './types';

interface JsonTree {
	[segment: string]: string | JsonTree;
}

/**
 * Keys that are a strict prefix of another key, and so cannot be leaves.
 *
 * Linear rather than the obvious pairwise scan: every key contributes its own ancestor paths to a
 * set, and any key appearing in that set is a branch somewhere else.
 */
function branchKeys(entries: readonly ExtractedString[]): ReadonlySet<string> {
	const branches = new Set<string>();
	for (const entry of entries) {
		const segments = entry.key.split('.');
		for (let i = 1; i < segments.length; i++) branches.add(segments.slice(0, i).join('.'));
	}
	return branches;
}

/**
 * Nested, splitting keys on `.` — Gleef-anchored, and i18next's default `keySeparator` is `'.'`, so
 * a flat map would need consumer configuration to resolve at all (§2.1.1).
 *
 * **Prefix collisions are omitted, never silently resolved** (§2.1.2). When a key is both a leaf and
 * a branch — `home.title` alongside `home.title.sub` — the branch wins and the shorter key is left
 * out and reported. i18next cannot represent both: `t('home.title')` walks the same path whether the
 * value is a string or an object. Of the available options this is the only one that is
 * deterministic regardless of input order, lossless for the greater number of strings, and visible
 * to the user. The real fix is upstream in LS-9's uniqueness rule (§1.2).
 */
export function serializeJson(entries: readonly ExtractedString[]): {
	content: string;
	omitted: OmittedEntry[];
} {
	const branches = branchKeys(entries);
	const tree: JsonTree = {};

	for (const entry of entries) {
		if (branches.has(entry.key)) continue;

		const segments = entry.key.split('.');
		const leaf = segments.pop();
		if (leaf === undefined) continue;

		let node = tree;
		for (const segment of segments) {
			const next = node[segment];
			if (next === undefined || typeof next === 'string') {
				// `typeof next === 'string'` is unreachable once branch keys are omitted; creating a
				// fresh object rather than throwing keeps a future upstream change from crashing export.
				const created: JsonTree = {};
				node[segment] = created;
				node = created;
			} else {
				node = next;
			}
		}
		node[leaf] = entry.value;
	}

	// §2.1.3–4: JSON.stringify's escaping (non-ASCII stays literal UTF-8), 2-space indent, and no
	// trailing newline — stringify adds none, which is what the goldens expect.
	return {
		content: JSON.stringify(tree, null, 2),
		omitted: entries
			.filter((entry) => branches.has(entry.key))
			.map((entry) => ({ nodeId: entry.nodeId, key: entry.key, reason: 'json-prefix-collision' as const })),
	};
}
