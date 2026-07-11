// src/main/traversal/model.ts — OWNED by LS-3. Main-thread only. NOT serializable.
//
// The rich per-node model downstream features (LS-8, LS-9, LS-12) consume. It holds values that
// cannot cross the bridge (FontName arrays, ambient Rect), so it never moves to src/common; the
// wire projection is toScannedTextNode() in ./derive.
export interface TextNodeModel {
	nodeId: string;
	characters: string;

	// resize / truncation — RAW API values, NOT interpreted. Overflow semantics are LS-7's.
	textAutoResize: TextNode['textAutoResize']; // incl. legacy 'TRUNCATE' (read-only, never written)
	textTruncation: TextNode['textTruncation'];
	maxLines: number | null; // meaningful only when textTruncation === 'ENDING'
	maxHeight: number | null; // populated only for auto-layout children; second truncation trigger

	// geometry (ambient figma Rect; main-side only)
	ownBounds: Rect | null; // node.absoluteBoundingBox — may be null (zero-area / invisible)
	containerBounds: Rect | null; // immediate parent's absoluteBoundingBox; null if parent is the page
	parentClipsContent: boolean; // context for LS-7 ancestor selection; false when parent has no such prop
	rotation: number; // degrees, -180..180

	// display path for the wire DTO, e.g. "home / header" — nearest named ancestor frames, depth
	// capped at 3. (Model expansion over the spec §1 block: toScannedTextNode(model) is
	// single-argument and the DTO carries containerLabel, so the model must too.)
	containerLabel: string;

	// fonts — main-side only (FontName & figma.mixed are non-serializable)
	fonts: FontName[]; // single → [fontName]; mixed → getRangeAllFontNames(0, len); empty → []
	isMixedFont: boolean; // node.fontName === figma.mixed

	// flags
	hasMissingFont: boolean; // node.hasMissingFont
	inInstance: boolean; // any ancestor is an INSTANCE
	locked: boolean; // effective — self OR any ancestor locked
	hidden: boolean; // effective — self OR any ancestor not visible
	empty: boolean; // characters.length === 0
}
