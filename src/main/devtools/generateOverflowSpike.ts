// src/main/devtools/generateOverflowSpike.ts
// Dev-only fixture bootstrapper for fixtures/overflow-spike.fig (LS-7 §3 validation fixture,
// promoted to the LS-8 acceptance fixture — fixtures/overflow-spike.md).
// Builds 15 of the 17 rows; two rows CANNOT be scripted:
//   • `missing-font` / `mixed-font-missing` — loadFontAsync fails for unavailable fonts by
//     definition; follow the manual procedure in fixtures/overflow-spike.md after running this.
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
// 43 chars — at ~7.8 px/char and Inter Regular 16 that is ≈335px of text, so it CANNOT fit the
// 200px box on one line and must wrap. Two lines ≈38px, comfortably inside the 60px box height.
const WRAPS_FITS = 'The quick brown fox jumps over the lazy dog';

// Stamped onto the README frame. A row's name states the verdict for the candidate the pass-1
// harness INJECTS, not for a scan of the authored text — and since every row outside the pass-2 set
// holds the 12-character SOURCE placeholder (except `empty` and the two manual font rows), three of
// them legitimately report `fits` in the panel.
// Without this on the canvas, the next person to open the file and press Scan files three engine
// bugs that do not exist (LS-8.2 §5 carry-forward 6).
const READ_THE_ROW_NAMES =
	'*** READ THE ROW NAMES CORRECTLY — THEY ARE NOT SCAN PREDICTIONS ***\n' +
	'A row name states the verdict for the candidate the pass-1 harness INJECTS, not the verdict for\n' +
	'a scan of the text authored in the node. Only fixed-fits, fixed-overflows, fixed-wraps-fits and\n' +
	'autoheight-maxlines carry meaningful authored characters. Other generated non-empty rows hold\n' +
	`the placeholder "${SOURCE}", which fits its box; empty and the manual font rows are exceptions.\n` +
	'So opening this file and pressing Scan in the panel makes truncate-overflows,\n' +
	'autoheight-overflows and hug-overflows report "fits". THAT IS CORRECT — not an engine bug.\n' +
	'Panel-facing verdict validation needs a purpose-built known-overflow file (LS-17).';

export interface OverflowSpikeReport {
	created: string[];
	manualSteps: string[];
}

// Parent frames are the constraining bounds from the §3 table: 300×100.
const COL_W = 300;
const ROW_H = 100;
const GAP = 40;

// The README frame's reserved height, and the single source of the row grid's top offset. Frames
// clip their content by default, so a README taller than this box would silently hide its own
// tail — which is exactly where the manual steps live. Sized for the current text (~24 lines at
// Inter Regular 16 across a 1280px measure) with headroom; the frame also has clipping turned off
// below, so overrunning it degrades to overlap rather than to invisible text.
const README_H = 560;

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
		const xy = { x: (slot % 4) * (COL_W + GAP), y: Math.floor(slot / 4) * (ROW_H + GAP) + README_H + GAP };
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

	// ── fixed-wraps-fits — NONE, box 200×60. The regression test for the horizontal-overflow
	// defect: the candidate is far too wide for the box on one line, so Figma character-wraps it to
	// two, and two lines fit the height. The verdict must be `fits`.
	//
	// The old branch unlocked the clone to WIDTH_AND_HEIGHT, which stops wrapping, and compared that
	// unwrapped ~335px width against the 200px box — reporting `overflows` for a box that visibly
	// fits. Geometry is load-bearing here: widen the box past ~340 and the string stops wrapping,
	// or shorten it below ~50px and it stops fitting, and either way the row tests nothing.
	{
		const f = makeFrame('fixed-wraps-fits');
		const t = makeText('fixed-wraps-fits', f);
		t.characters = WRAPS_FITS;
		t.textAutoResize = 'NONE';
		t.resize(200, 60);
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
	// Placeholder frame; follow the unavailable-font procedure in fixtures/overflow-spike.md.
	makeFrame('missing-font');

	// ── mixed-font-missing — NOT SCRIPTABLE, manual step ───────────────────────
	// Build alongside missing-font while the uncommon font is installed, then make it unavailable.
	makeFrame('mixed-font-missing');

	// ── empty — direct-caller guard; production scanOverflow excludes it (LS-25) ─
	{
		const f = makeFrame('empty');
		const t = makeText('empty', f);
		t.characters = '';
	}

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
		'missing-font + mixed-font-missing: while an uncommon local font is installed, create a text node in each matching frame. Set all of missing-font to that family. Set mixed-font-missing to that family, then change roughly half its characters to Inter Regular and confirm the font field reads Mixed. Save, quit Figma, uninstall the uncommon font, relaunch, and confirm both nodes show missing-font state. See fixtures/overflow-spike.md for the full procedure. STANDING STEP — EVERY regeneration wipes both manual rows. The family in the live file was Fontine.',
		"truncate-fits / truncate-overflows: confirm the generate-time console lines reported textAutoResize = 'TRUNCATE' for both. If not, note it below and in docs/specs/LS-7.md §6.",
		'Fill in: missing-font family shared by both manual rows = ________, truncate rows report TRUNCATE = ________, generated on = ________.',
		'Save as fixtures/overflow-spike.fig (or record the shared-Figma link in fixtures/README.md).',
		'Run the check: npm run dev → open this file → click "Run LS-8 overflow check" → expect all 17 pass-1 rows, the pass-2 authored/font/empty checks + ja refusal, and selection + node-gone (fixtures/overflow-spike.md).',
	];
	{
		const readme = figma.createFrame();
		readme.name = 'README';
		readme.x = 0;
		readme.y = 0;
		readme.resize(4 * (COL_W + GAP) - GAP, README_H);
		// Never clip the README: a hidden manual-steps list is worse than an untidy frame.
		readme.clipsContent = false;
		figma.currentPage.appendChild(readme);
		const t = figma.createText();
		t.name = '_readme-text';
		t.fontName = REGULAR;
		t.characters =
			'overflow-spike.fig — LS-8 acceptance fixture (ex-LS-7 spike). Build sheet: docs/specs/LS-8.1.md §3;\n' +
			'authoring doc: fixtures/overflow-spike.md.\n\n' +
			READ_THE_ROW_NAMES +
			'\n\nGenerated by generateOverflowSpike (dev-only). MANUAL STEPS REMAINING:\n\n' +
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
