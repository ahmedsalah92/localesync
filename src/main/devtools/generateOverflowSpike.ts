// src/main/devtools/generateOverflowSpike.ts
// Dev-only fixture bootstrapper for fixtures/overflow-spike.fig (LS-7 §3 validation fixture).
// Builds 13 of the 14 rows in docs/specs/LS-7.md §3; one row CANNOT be scripted:
//   • `missing-font` — loadFontAsync fails for unavailable fonts by definition; follow the manual
//     procedure in fixtures/kitchen-sink.md §"missing-font" after running this.
// The two truncate-* rows are authored as NONE + textTruncation ENDING, which current Figma REPORTS
// as textAutoResize 'TRUNCATE' (agent-guidelines §2) — the console logs the reported mode on
// generate so the manual check is settled immediately.
//
// Main thread only. Never ships: wire behind import.meta.env.DEV, same pattern as the other
// generators. Run in a fresh empty file/page, then complete the manual steps and save.

const REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const BOLD: FontName = { family: 'Inter', style: 'Bold' };

// Authored source text only — the spike runner measures hard-coded candidate strings, not these.
const SOURCE = 'Source label';

export interface OverflowSpikeReport {
	created: string[];
	manualSteps: string[];
}

// Parent frames are the constraining bounds from the §3 table: 300×100.
const COL_W = 300;
const ROW_H = 100;
const GAP = 40;

export async function generateOverflowSpike(): Promise<OverflowSpikeReport> {
	if (figma.currentPage.children.length > 0) {
		throw new Error('generateOverflowSpike: current page is not empty — run this in a fresh file/page.');
	}
	figma.currentPage.name = 'overflow-spike';

	await figma.loadFontAsync(REGULAR);
	await figma.loadFontAsync(BOLD);

	const created: string[] = [];
	let slot = 0;

	function slotXY(): { x: number; y: number } {
		const xy = { x: (slot % 4) * (COL_W + GAP), y: Math.floor(slot / 4) * (ROW_H + GAP) + 340 }; // room for README
		slot++;
		return xy;
	}

	function makeFrame(name: string): FrameNode {
		const frame = figma.createFrame();
		frame.name = name;
		const { x, y } = slotXY();
		frame.x = x;
		frame.y = y;
		frame.resize(COL_W, ROW_H);
		figma.currentPage.appendChild(frame);
		return frame;
	}

	function makeText(name: string, parent: BaseNode & ChildrenMixin): TextNode {
		const text = figma.createText();
		text.name = name;
		text.fontName = REGULAR;
		// 16px makes the runner's LONG candidate reliably exceed every §3 box: ~7 wrapped lines at
		// width 200 (≈130px, beats the 40px fixed boxes and the ~80px container room) and ≈1200px as
		// a single hug line (beats the 300px parent width).
		text.fontSize = 16;
		text.characters = SOURCE;
		parent.appendChild(text);
		text.x = 20;
		text.y = 20;
		created.push(name);
		return text;
	}

	// ── fixed-fits / fixed-overflows — NONE, 200×40, parent 300×100 ────────────
	for (const name of ['fixed-fits', 'fixed-overflows']) {
		const f = makeFrame(name);
		const t = makeText(name, f);
		t.textAutoResize = 'NONE';
		t.resize(200, 40);
	}

	// ── truncate-fits / truncate-overflows — fixed box + truncation enabled ────
	for (const name of ['truncate-fits', 'truncate-overflows']) {
		const f = makeFrame(name);
		const t = makeText(name, f);
		t.textAutoResize = 'NONE';
		t.resize(200, 40);
		t.textTruncation = 'ENDING';
		console.log(`[dev] ${name} reports textAutoResize = '${t.textAutoResize}' (want 'TRUNCATE')`);
	}

	// ── autoheight-fits / autoheight-overflows — HEIGHT, width 200 ─────────────
	for (const name of ['autoheight-fits', 'autoheight-overflows']) {
		const f = makeFrame(name);
		const t = makeText(name, f);
		t.textAutoResize = 'HEIGHT';
		t.resize(200, t.height);
	}

	// ── autoheight-maxlines — HEIGHT, maxLines 2, truncation ENDING ────────────
	{
		const f = makeFrame('autoheight-maxlines');
		const t = makeText('autoheight-maxlines', f);
		t.textAutoResize = 'HEIGHT';
		t.resize(200, t.height);
		t.textTruncation = 'ENDING';
		t.maxLines = 2;
	}

	// ── autoheight-maxheight — auto-layout child with maxHeight 50 ─────────────
	// maxHeight is applicable only to auto-layout frames and their direct children
	// (agent-guidelines §2), so this row's parent is the fixture's one auto-layout frame.
	{
		const f = makeFrame('autoheight-maxheight');
		f.layoutMode = 'VERTICAL';
		f.primaryAxisSizingMode = 'FIXED';
		f.counterAxisSizingMode = 'FIXED';
		f.resize(COL_W, ROW_H);
		f.paddingLeft = 20;
		f.paddingTop = 20;
		const t = makeText('autoheight-maxheight', f);
		t.textAutoResize = 'HEIGHT';
		t.layoutSizingHorizontal = 'FIXED';
		t.resize(200, t.height);
		t.maxHeight = 50;
	}

	// ── hug-fits / hug-overflows — WIDTH_AND_HEIGHT, parent 300×100 ────────────
	for (const name of ['hug-fits', 'hug-overflows']) {
		const f = makeFrame(name);
		const t = makeText(name, f);
		t.textAutoResize = 'WIDTH_AND_HEIGHT';
	}

	// ── hug-page-parent — WIDTH_AND_HEIGHT, parent is the page ─────────────────
	{
		const t = makeText('hug-page-parent', figma.currentPage);
		t.textAutoResize = 'WIDTH_AND_HEIGHT';
		const { x, y } = slotXY();
		t.x = x;
		t.y = y;
	}

	// ── missing-font — NOT SCRIPTABLE, manual step ─────────────────────────────
	// Placeholder frame; follow the missing-font procedure from kitchen-sink.md.
	makeFrame('missing-font');

	// ── mixed-font-ok — two available fonts on one node ────────────────────────
	{
		const f = makeFrame('mixed-font-ok');
		const t = makeText('mixed-font-ok', f);
		t.setRangeFontName(0, Math.floor(t.characters.length / 2), BOLD);
	}

	// ── rotated-fixed — NONE, 200×40, rotation 30° ─────────────────────────────
	{
		const f = makeFrame('rotated-fixed');
		const t = makeText('rotated-fixed', f);
		t.textAutoResize = 'NONE';
		t.resize(200, 40);
		t.rotation = 30;
	}

	// ── README frame ───────────────────────────────────────────────────────────
	const manualSteps = [
		'missing-font: create a text node named "missing-font" inside the missing-font frame using an unavailable font family (see fixtures/kitchen-sink.md §missing-font for the procedure). Record the font family below.',
		"truncate-fits / truncate-overflows: confirm the generate-time console lines reported textAutoResize = 'TRUNCATE' for both. If not, note it below and in docs/specs/LS-7.md §6.",
		'Fill in: missing-font family = ________, truncate rows report TRUNCATE = ________, generated on = ________.',
		'Save as fixtures/overflow-spike.fig (or record the shared-Figma link in fixtures/README.md).',
		'Run the spike: npm run dev → open this file → click "Run LS-7 overflow spike" → record verdicts + observations in docs/specs/LS-7.md §6.',
	];
	{
		const readme = figma.createFrame();
		readme.name = 'README';
		readme.x = 0;
		readme.y = 0;
		readme.resize(4 * (COL_W + GAP) - GAP, 300);
		figma.currentPage.appendChild(readme);
		const t = figma.createText();
		t.name = '_readme-text';
		t.fontName = REGULAR;
		t.characters =
			'overflow-spike.fig — LS-7 spike validation fixture. Build sheet: docs/specs/LS-7.md §3;\n' +
			'authoring doc: fixtures/overflow-spike.md.\n' +
			'Generated by generateOverflowSpike (dev-only). MANUAL STEPS REMAINING:\n\n' +
			manualSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
		readme.appendChild(t);
		t.textAutoResize = 'HEIGHT';
		t.x = 20;
		t.y = 20;
		t.layoutSizingHorizontal = 'FIXED';
		t.resize(readme.width - 40, t.height);
	}

	figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
	return { created, manualSteps };
}
