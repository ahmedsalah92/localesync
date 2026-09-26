// src/main/preview/rows.ts — which layers a preview writes, and what each row reports (LS-12 §2.3).
// Pure: the caller reads the nodes.
import type { BlockedNode, PreviewRow } from '../../common/models';
import type { StoredKey } from '../extract/persist';

export interface Owner {
	nodeId: string;
	key: string;
	source: string;
}

/** Rule 9: a node owns the key its stamp names only when the stamp names the node itself. */
export function ownersOf(nodes: readonly { id: string; characters: string; stored: StoredKey | null }[]): Owner[] {
	return nodes.flatMap((node) =>
		node.stored !== null && node.stored.n === node.id
			? [{ nodeId: node.id, key: node.stored.k, source: node.characters }]
			: [],
	);
}

export function planPreview(
	owners: readonly Owner[],
	translations: Readonly<Record<string, string>>,
): { targets: { nodeId: string; value: string }[]; rows: PreviewRow[] } {
	const targets: { nodeId: string; value: string }[] = [];
	const rows: PreviewRow[] = owners.map((owner) => {
		// Own-property only (final review fix): `translations[owner.key]` alone resolves an inherited
		// Object.prototype member for a key like `constructor` or `toString`, which is never a real
		// translation and must fall back rather than become a "target" written to the canvas.
		const value = Object.prototype.hasOwnProperty.call(translations, owner.key)
			? translations[owner.key]
			: undefined;
		if (value === undefined || value === '') return { ...owner, value: null };
		targets.push({ nodeId: owner.nodeId, value });
		return { ...owner, value };
	});
	return { targets, rows };
}

export function unmatchedKeys(owners: readonly Owner[], translations: Readonly<Record<string, string>>): string[] {
	const owned = new Set(owners.map((owner) => owner.key));
	return Object.keys(translations)
		.filter((key) => !owned.has(key))
		.sort();
}

/** A blocked node is reported in its skipped group, never as a row — so it can never be edited. */
export function withoutBlocked(rows: readonly PreviewRow[], blocked: readonly BlockedNode[]): PreviewRow[] {
	const skipped = new Set(blocked.map((entry) => entry.nodeId));
	return rows.filter((row) => !skipped.has(row.nodeId));
}
