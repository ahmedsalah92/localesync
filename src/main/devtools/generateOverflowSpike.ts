// src/main/devtools/generateOverflowSpike.ts
// Dev-only fixture bootstrapper for fixtures/overflow-spike.fig (LS-7 §3 validation fixture,
// promoted to the LS-8 acceptance fixture — fixtures/overflow-spike.md).
// Builds 13 of the 14 rows; one row CANNOT be scripted:
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

// Default authored text for rows whose characters don't matter (the LS-8 pass-1 check measures
// explicit candidate strings against clones). Three rows carry AUTHORED characters instead — the
// LS-8 §3 pass-2 table drives the real scanOverflow path through them (fixtures/overflow-spike.md).
const SOURCE = 'Source label';
const AUTHORED_FIXED_FITS = 'Your changes have been saved automatically.'; // 43 chars, de ratio 1.575 → 68
const AUTHORED_FIXED_OVERFLOWS = 'Save'; // 4 chars, de ratio 2.725 → 11 — the launch-narrative row
const AUTHORED_MAXLINES = 'Continue to checkout'; // 20 chars, de ratio 2.035 → 41

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

	// ── fixed-fits — NONE, box 600×40 (room for the 68-char de candidate, ≈530 px at Inter 16),
	// frame 640 wide = two grid slots. The box must have room for the EXPANDED string, or this
	// pass-2 `fits` row would overflow (LS-8 §3).
	{
		const f = makeFrame('fixed-fits');
		f.resize(2 * COL_W + GAP, ROW_H);
		slot++; // the wide frame consumes the neighbouring grid slot
		const t = makeText('fixed-fits', f);
		t.characters = AUTHORED_FIXED_FITS;
		t.textAutoResize = 'NONE';
		t.resize(600, 40);
	}

	// ── fixed-overflows — NONE, box cut snug to the English word (LS-8 §3: the four-letter button
	// that breaks in German; at the old 200×40 the 11-char candidate would FIT). Author auto-width
	// to capture the snug size, then pin it as a fixed box.
	{
		const f = makeFrame('fixed-overflows');
		const t = makeText('fixed-overflows', f);
		t.characters = AUTHORED_FIXED_OVERFLOWS;
		const snugWidth = t.width;
		const snugHeight = t.height;
		t.textAutoResize = 'NONE';
		t.resize(snugWidth, snugHeight);
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

	// ── autoheight-maxlines — HEIGHT, maxLines 2, truncation ENDING, width 140 ─
	// Width 140, not 200: at 200 the 41-char de candidate wraps into exactly the 2 permitted lines
	// (capped == free ⇒ `fits`); at 140 free growth needs 3 lines, so the cap detection fires
	// (LS-8 §3 pass 2). The authored 20-char label itself still lays out in 2 lines at 140.
	{
		const f = makeFrame('autoheight-maxlines');
		const t = makeText('autoheight-maxlines', f);
		t.characters = AUTHORED_MAXLINES;
		t.textAutoResize = 'HEIGHT';
		t.resize(140, t.height);
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
		'Run the check: npm run dev → open this file → click "Run LS-8 overflow check" → expect pass 1 14/14, pass 2 3/3 + the ja refusal, pass 3 selection + node-gone (fixtures/overflow-spike.md).',
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
			'overflow-spike.fig — LS-8 acceptance fixture (ex-LS-7 spike). Build sheet: docs/specs/LS-8.md §3;\n' +
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
