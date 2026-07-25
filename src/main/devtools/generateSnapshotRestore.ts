// src/main/devtools/generateSnapshotRestore.ts
// Dev-only fixture bootstrapper for fixtures/snapshot-restore.fig (FIX-1 / LS-17).
// Builds 9 of the 11 rows in docs/specs/LS-4.md §3; two rows CANNOT be scripted:
//   • `missing-font` — loadFontAsync fails for unavailable fonts by definition; follow the manual
//     procedure in fixtures/kitchen-sink.md §"missing-font" after running this.
//   • `legacy-truncate` — textAutoResize 'TRUNCATE' is read-only and cannot be written via the API;
//     requires an older .fig. Skippable per snapshot-restore.md (the planRestore unit test covers it).
//
// Main thread only. Never ships: wire behind import.meta.env.DEV, same pattern as the kitchen-sink
// generator. Run in a fresh empty file/page, then complete the manual steps and save.

const REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const BOLD: FontName = { family: 'Inter', style: 'Bold' };

const LOREM =
	'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly over it again and again.';

export interface SnapshotRestoreReport {
	created: string[];
	manualSteps: string[];
}

const COL_W = 360;
const ROW_H = 200;
const GAP = 40;

export async function generateSnapshotRestore(): Promise<SnapshotRestoreReport> {
	if (figma.currentPage.children.length > 0) {
		throw new Error('generateSnapshotRestore: current page is not empty — run this in a fresh file/page.');
	}
	figma.currentPage.name = 'snapshot-restore';

	await figma.loadFontAsync(REGULAR);
	await figma.loadFontAsync(BOLD);

	const created: string[] = [];
	let slot = 0;

	function makeFrame(name: string): FrameNode {
		const frame = figma.createFrame();
		frame.name = name;
		frame.x = (slot % 4) * (COL_W + GAP);
		frame.y = Math.floor(slot / 4) * (ROW_H + GAP) + 300; // leave room for README
		frame.resize(COL_W, ROW_H);
		slot++;
		figma.currentPage.appendChild(frame);
		return frame;
	}

	function makeText(name: string, characters: string, parent: FrameNode): TextNode {
		const text = figma.createText();
		text.name = name;
		text.fontName = REGULAR;
		text.characters = characters;
		parent.appendChild(text);
		text.x = 20;
		text.y = 20;
		created.push(name);
		return text;
	}

	// ── 1. auto-width ──────────────────────────────────────────────────────────
	{
		const f = makeFrame('auto-width');
		const t = makeText('auto-width', 'Auto width text', f);
		t.textAutoResize = 'WIDTH_AND_HEIGHT';
	}

	// ── 2. auto-height ─────────────────────────────────────────────────────────
	{
		const f = makeFrame('auto-height');
		const t = makeText('auto-height', LOREM, f);
		t.textAutoResize = 'HEIGHT';
		t.resize(200, t.height); // fixed width; height re-derives from content
	}

	// ── 3. fixed ───────────────────────────────────────────────────────────────
	{
		const f = makeFrame('fixed');
		const t = makeText('fixed', LOREM, f);
		t.textAutoResize = 'NONE';
		t.resize(200, 60);
	}

	// ── 4. truncating ──────────────────────────────────────────────────────────
	// snapshot-restore.md note: the spec's §3 listed NONE + maxLines:2, which aren't co-authorable —
	// maxLines requires a growing node. Built as auto-height with truncation + maxLines, which is the
	// combination that actually exercises maxLines restore. The harness is agnostic (round-trips the
	// node's actual state).
	{
		const f = makeFrame('truncating');
		const t = makeText('truncating', LOREM + ' ' + LOREM, f);
		t.textAutoResize = 'HEIGHT';
		t.resize(200, t.height);
		t.textTruncation = 'ENDING';
		t.maxLines = 2;
	}

	// ── 5. legacy-truncate — NOT SCRIPTABLE ────────────────────────────────────
	// textAutoResize 'TRUNCATE' cannot be written via the API. Requires a legacy .fig or the
	// fixed-size + truncation path (which reports TRUNCATE). Skippable per snapshot-restore.md.
	// Placeholder frame only.
	{
		const f = makeFrame('legacy-truncate');
		const t = makeText('legacy-truncate', LOREM, f);
		t.textAutoResize = 'NONE';
		t.resize(200, 40);
		t.textTruncation = 'ENDING';
		// Fixed size + truncation makes Figma REPORT textAutoResize as 'TRUNCATE' (a derived enum, not
		// writable and not shown in the panel — the only way to confirm it is to read the API). Log it
		// so the console settles the manual "does it report TRUNCATE?" check on generate. If it prints
		// anything other than 'TRUNCATE', note it in the README and skip the row — the planRestore unit
		// test covers the branch.
		console.log(`[dev] legacy-truncate reports textAutoResize = '${t.textAutoResize}' (want 'TRUNCATE')`);
	}

	// ── 6. missing-font — NOT SCRIPTABLE, manual step ──────────────────────────
	// Placeholder frame; follow the missing-font procedure from kitchen-sink.md.
	makeFrame('missing-font');

	// ── 7. mixed-font ──────────────────────────────────────────────────────────
	{
		const f = makeFrame('mixed-font');
		const t = makeText('mixed-font', 'Half regular half bold', f);
		// Set the first half to Bold so node.fontName === figma.mixed.
		t.setRangeFontName(0, Math.floor(t.characters.length / 2), BOLD);
	}

	// ── 8. instance-child (SENTINEL — required for the harness to run) ─────────
	// The harness only fires its mutating cycle when a node labelled 'instance-child' is present.
	// kitchen-sink.fig does NOT carry this label, so the snapshot check can never mutate it.
	{
		const f = makeFrame('instance-child');
		// Component with a text child → place an instance.
		const comp = figma.createComponent();
		comp.name = '_snapshot-master';
		comp.resize(200, 60);
		f.appendChild(comp);
		const masterText = figma.createText();
		masterText.name = '_snapshot-master-text';
		masterText.fontName = REGULAR;
		masterText.characters = 'Instance child text';
		comp.appendChild(masterText);
		masterText.x = 10;
		masterText.y = 10;

		const inst = comp.createInstance();
		f.appendChild(inst);
		inst.x = 20;
		inst.y = 80;

		// Find the text node inside the instance and rename it to the sentinel label.
		const instanceText = inst.findOne((n) => n.type === 'TEXT') as TextNode | null;
		if (instanceText) {
			instanceText.name = 'instance-child';
			// Override characters to prove the override sticks after restore.
			instanceText.characters = 'Instance child override';
			created.push('instance-child');
		}
	}

	// ── 9. empty ───────────────────────────────────────────────────────────────
	{
		const f = makeFrame('empty');
		makeText('empty', '', f);
	}

	// ── 10. rotated ────────────────────────────────────────────────────────────
	{
		const f = makeFrame('rotated');
		const t = makeText('rotated', 'Rotated 30 degrees', f);
		t.rotation = 30;
	}

	// ── 11. zero-size ──────────────────────────────────────────────────────────
	// Figma floors dimensions at 0.01 px; the stored float32 lands marginally under
	// (0.009999999776482582). The harness compares with ≤ 0.01 tolerance.
	{
		const f = makeFrame('zero-size');
		const t = makeText('zero-size', 'x', f);
		t.textAutoResize = 'NONE';
		t.resizeWithoutConstraints(0.01, 0.01);
	}

	// ── README frame ───────────────────────────────────────────────────────────
	const manualSteps = [
		'missing-font: create a text node named "missing-font" inside the missing-font frame using an unavailable font family (see kitchen-sink.md §missing-font for the procedure). Record the font family below.',
		'legacy-truncate: verify the properties panel shows textAutoResize as "TRUNCATE" on that node. If it does not, note "skipped — not obtainable" below; the planRestore unit test covers the branch.',
		'Verify the instance-child node shows "Instance child override" and is inside an instance (the SENTINEL label the harness checks).',
		'Fill in: missing-font family = ________, legacy-truncate status = ________, generated on = ________.',
		'Save as fixtures/snapshot-restore.fig (or record the shared-Figma link in fixtures/README.md).',
		'Run the LS-4 snapshot check: npm run dev → open this file → click "Run LS-4 snapshot check" → verify all PASS in the browser console.',
	];
	{
		const readme = figma.createFrame();
		readme.name = 'README';
		readme.x = 0;
		readme.y = 0;
		readme.resize(4 * (COL_W + GAP) - GAP, 260);
		figma.currentPage.appendChild(readme);
		const t = figma.createText();
		t.name = '_readme-text';
		t.fontName = REGULAR;
		t.characters =
			'snapshot-restore.fig — FIX-1 / LS-17. Build sheet: docs/specs/LS-4.md §3;\n' +
			'authoring doc: fixtures/snapshot-restore.md.\n' +
			'Generated by generateSnapshotRestore (dev-only). MANUAL STEPS REMAINING:\n\n' +
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
