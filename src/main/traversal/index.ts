// src/main/traversal/index.ts  (main thread; uses the `figma` global)
//
// LS-3 public API: the read-only "find and describe every relevant text node" layer. traverse()
// walks the requested scope under dynamic-page and returns a fresh TextNodeModel per eligible text
// node — hidden, locked, empty and missing-font nodes included (tagged, never dropped, never
// mutated; no loadFontAsync anywhere). There is no persistent registry: the durable cross-message
// handle is nodeId, re-fetched by consumers via figma.getNodeByIdAsync.
import type { ScanScope } from '../../common/messages';
import { on, respond, send } from '../bridge';
import { deriveContainerLabel, deriveFontInfo, resolveEffectiveFlags, toScannedTextNode } from './derive';
import type { TextNodeModel } from './model';

export { toScannedTextNode };
export type { TextNodeModel };

/** Selection-scoped traversal with nothing selected; mapped to the `no-selection` wire error. */
export class NoSelectionError extends Error {
	constructor() {
		super('Nothing is selected — select at least one layer and rescan');
		this.name = 'NoSelectionError';
	}
}

// The only node types carrying clipsContent (removed from groups — guard by type, never `in`),
// and the ancestors whose names make up containerLabel.
type FrameLike = FrameNode | ComponentNode | ComponentSetNode | InstanceNode;

function isFrameLike(node: BaseNode): node is FrameLike {
	return (
		node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE'
	);
}

function collectTextNodes(scope: ScanScope): TextNode[] {
	if (scope === 'page') {
		// Descends the whole subtree, including into instances (skipInvisibleInstanceChildren stays
		// at its default false — hidden nodes are characterized, never silently dropped).
		return figma.currentPage.findAllWithCriteria({ types: ['TEXT'] });
	}

	const selection = figma.currentPage.selection;
	if (selection.length === 0) throw new NoSelectionError();

	// Selected text nodes count themselves; selected containers contribute their subtree. De-dup
	// by id — a selected text node may also sit inside another selected container.
	const byId = new Map<string, TextNode>();
	for (const node of selection) {
		if (node.type === 'TEXT') {
			byId.set(node.id, node);
		} else if ('findAllWithCriteria' in node) {
			for (const text of node.findAllWithCriteria({ types: ['TEXT'] })) byId.set(text.id, text);
		}
	}
	return [...byId.values()];
}

function buildModel(node: TextNode): TextNodeModel {
	// One upward walk collects everything ancestor-derived: effective-flag inputs, instance
	// detection, and the nearest named frame ancestors (nearest-first) for the display label.
	const ancestors: { locked: boolean; visible: boolean }[] = [];
	const frameNames: string[] = [];
	let inInstance = false;

	let current = node.parent;
	while (current !== null && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
		ancestors.push({ locked: current.locked, visible: current.visible });
		if (current.type === 'INSTANCE') inInstance = true;
		if (isFrameLike(current)) frameNames.push(current.name);
		current = current.parent;
	}

	const parent = node.parent;
	// Which ancestor is the "overflow container" is an LS-7 decision — record the immediate
	// parent's box (null when the parent is the page) and its clipsContent only.
	const containerBounds =
		parent !== null && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT' ? parent.absoluteBoundingBox : null;
	const { fonts, isMixedFont, empty } = deriveFontInfo(node.fontName, figma.mixed, node.characters, () =>
		node.getRangeAllFontNames(0, node.characters.length),
	);
	const { locked, hidden } = resolveEffectiveFlags(node.locked, node.visible, ancestors);

	return {
		nodeId: node.id,
		characters: node.characters,
		textAutoResize: node.textAutoResize,
		textTruncation: node.textTruncation,
		maxLines: node.maxLines,
		maxHeight: node.maxHeight,
		ownBounds: node.absoluteBoundingBox,
		containerBounds,
		parentClipsContent: parent !== null && isFrameLike(parent) ? parent.clipsContent : false,
		rotation: node.rotation,
		containerLabel: deriveContainerLabel(frameNames),
		fonts,
		isMixedFont,
		hasMissingFont: node.hasMissingFont,
		inInstance,
		locked,
		hidden,
		empty,
	};
}

/** Await current-page load, walk the scope, return a fresh model per eligible text node. */
export async function traverse(scope: ScanScope): Promise<TextNodeModel[]> {
	// Under dynamic-page, findAllWithCriteria on an unloaded page throws (agent-guidelines §2).
	await figma.currentPage.loadAsync();
	return collectTextNodes(scope).map(buildModel);
}

/** Wires the LS-2 scan-request/scan-result pair to traverse(). Called once from main.ts. */
export function registerTraversal(): void {
	on('scan-request', (msg) => {
		void (async () => {
			try {
				const models = await traverse(msg.scope);
				// Zero text nodes is a valid empty result (the UI empty-state owns it), not an error.
				respond<'scan-request'>(msg.id, { type: 'scan-result', nodes: models.map(toScannedTextNode) });
			} catch (err) {
				if (err instanceof NoSelectionError) {
					send({ type: 'error', id: msg.id, code: 'no-selection', severity: 'error', message: err.message });
				} else {
					send({
						type: 'error',
						id: msg.id,
						code: 'internal',
						severity: 'error',
						message: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
					});
				}
			}
		})();
	});
}
