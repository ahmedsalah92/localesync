// src/main/traversal/derive.ts — pure derivation seams (no figma access, no bridge import).
//
// Factored out so the Vitest acceptance tests run without a plugin runtime: ./index pulls in the
// bridge, whose module scope assigns figma.ui.onmessage, so tests import from here instead.
import type { ScannedTextNode } from '../../common/models';
import type { TextNodeModel } from './model';

/** Join ancestor frame names (nearest-first, as collected walking up) into the display path:
 *  depth-capped at the nearest 3, rendered outermost-first, ' / '-separated — "home / header". */
export function deriveContainerLabel(names: string[]): string {
	return names.slice(0, 3).reverse().join(' / ');
}

/** Effective hidden/locked: self OR any ancestor (node.visible / node.locked are self-only).
 *  A visible node inside a hidden frame must read hidden: true. Ancestor order is irrelevant. */
export function resolveEffectiveFlags(
	selfLocked: boolean,
	selfVisible: boolean,
	ancestors: { locked: boolean; visible: boolean }[],
): { locked: boolean; hidden: boolean } {
	return {
		locked: selfLocked || ancestors.some((ancestor) => ancestor.locked),
		hidden: !selfVisible || ancestors.some((ancestor) => !ancestor.visible),
	};
}

/** Font + emptiness classification: empty → no fonts; mixed → every range font; single → wrapped.
 *  The mixed sentinel is a parameter so tests pass a plain Symbol(); traverse passes figma.mixed.
 *  rangeFonts is only invoked for the mixed case (reads only — LS-3 never calls loadFontAsync). */
export function deriveFontInfo(
	fontName: FontName | symbol,
	mixedSentinel: symbol,
	characters: string,
	rangeFonts: () => FontName[],
): { fonts: FontName[]; isMixedFont: boolean; empty: boolean } {
	const empty = characters.length === 0;
	if (empty) return { fonts: [], isMixedFont: false, empty };
	if (fontName === mixedSentinel) return { fonts: rangeFonts(), isMixedFont: true, empty };
	// Not the sentinel, so not figma.mixed — the only symbol fontName can ever be.
	return { fonts: [fontName as FontName], isMixedFont: false, empty };
}

/** Serializable projection for the bridge — exactly the nine DTO fields, listed explicitly
 *  (never a spread: spreading would leak main-side fields like fonts/bounds onto the wire). */
export function toScannedTextNode(model: TextNodeModel): ScannedTextNode {
	return {
		nodeId: model.nodeId,
		characters: model.characters,
		containerLabel: model.containerLabel,
		hasMissingFont: model.hasMissingFont,
		isMixedFont: model.isMixedFont,
		inInstance: model.inInstance,
		locked: model.locked,
		hidden: model.hidden,
		empty: model.empty,
	};
}
