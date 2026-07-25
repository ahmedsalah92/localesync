// src/main/devtools/generateLargeFile.ts
// Dev-only fixture bootstrapper for fixtures/large-file.fig (LS-17; consumed by LS-15's
// performance pass). Builds ≈1500 text nodes — inside the issue's 1–2k target — with realistic
// variety so scans hit real branches, not one hot path: mixed resize modes, some truncation,
// varied string lengths, plain + auto-layout frames, and text inside instances
// (findAllWithCriteria descends into instances; ~20% of nodes here are instance children).
//
// Main thread only. Never ships: wire behind import.meta.env.DEV, same pattern as the other
// generators. Run in a fresh empty file/page, save as fixtures/large-file.fig. Fully scriptable —
// no manual steps.

const REGULAR: FontName = { family: 'Inter', style: 'Regular' };

const STRINGS = [
	'OK',
	'Save changes',
	'Your subscription renews automatically on the first of every month.',
	'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly over it again and again.',
];

export interface LargeFileReport {
	totalTextNodes: number;
	frames: number;
	instances: number;
}

const PLAIN_FRAMES = 90;
const AUTOLAYOUT_FRAMES = 10;
const TEXTS_PER_FRAME = 12;
const INSTANCES = 59;
const TEXTS_PER_COMPONENT = 5;

const FRAME_W = 340;
const FRAME_H = 420;
const GAP = 40;

export async function generateLargeFile(): Promise<LargeFileReport> {
	if (figma.currentPage.children.length > 0) {
		throw new Error('generateLargeFile: current page is not empty — run this in a fresh file/page.');
	}
	figma.currentPage.name = 'large-file';

	await figma.loadFontAsync(REGULAR);

	let slot = 0;
	function placeInGrid(node: SceneNode): void {
		node.x = (slot % 10) * (FRAME_W + GAP);
		node.y = Math.floor(slot / 10) * (FRAME_H + GAP);
		slot++;
	}

	function makeText(name: string, index: number, parent: BaseNode & ChildrenMixin): TextNode {
		const text = figma.createText();
		text.name = name;
		text.fontName = REGULAR;
		text.characters = STRINGS[index % STRINGS.length] ?? 'OK';
		parent.appendChild(text);
		text.x = 20;
		text.y = 20 + index * 32;
		// Cycle resize modes so traversal/overflow scans exercise every branch at volume.
		const mode = index % 3;
		if (mode === 0) {
			text.textAutoResize = 'NONE';
			text.resize(180, 24);
		} else if (mode === 1) {
			text.textAutoResize = 'HEIGHT';
			text.resize(180, text.height);
		} // mode 2: keep the WIDTH_AND_HEIGHT default
		if (index % 4 === 3) text.textTruncation = 'ENDING';
		return text;
	}

	// ── Plain frames ───────────────────────────────────────────────────────────
	for (let f = 0; f < PLAIN_FRAMES; f++) {
		const frame = figma.createFrame();
		frame.name = `plain-${f}`;
		frame.resize(FRAME_W, FRAME_H);
		placeInGrid(frame);
		figma.currentPage.appendChild(frame);
		for (let i = 0; i < TEXTS_PER_FRAME; i++) makeText(`plain-${f}-t${i}`, i, frame);
	}

	// ── Auto-layout frames ─────────────────────────────────────────────────────
	for (let f = 0; f < AUTOLAYOUT_FRAMES; f++) {
		const frame = figma.createFrame();
		frame.name = `autolayout-${f}`;
		frame.resize(FRAME_W, FRAME_H);
		placeInGrid(frame);
		figma.currentPage.appendChild(frame);
		frame.layoutMode = 'VERTICAL';
		frame.primaryAxisSizingMode = 'FIXED';
		frame.counterAxisSizingMode = 'FIXED';
		frame.paddingLeft = 20;
		frame.paddingTop = 20;
		frame.itemSpacing = 8;
		for (let i = 0; i < TEXTS_PER_FRAME; i++) makeText(`autolayout-${f}-t${i}`, i, frame);
	}

	// ── Component + instances (instance-child text at volume) ──────────────────
	const comp = figma.createComponent();
	comp.name = '_large-file-master';
	comp.resize(FRAME_W, 200);
	placeInGrid(comp);
	figma.currentPage.appendChild(comp);
	for (let i = 0; i < TEXTS_PER_COMPONENT; i++) makeText(`master-t${i}`, i, comp);

	for (let n = 0; n < INSTANCES; n++) {
		const inst = comp.createInstance();
		inst.name = `instance-${n}`;
		placeInGrid(inst);
		figma.currentPage.appendChild(inst);
	}

	const totalTextNodes = figma.currentPage.findAllWithCriteria({ types: ['TEXT'] }).length;
	figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
	return {
		totalTextNodes,
		frames: PLAIN_FRAMES + AUTOLAYOUT_FRAMES,
		instances: INSTANCES,
	};
}
