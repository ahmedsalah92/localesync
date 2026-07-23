// src/main/devtools/generateKitchenSink.ts
// Dev-only fixture bootstrapper for fixtures/kitchen-sink.fig (FIX-1 / LS-17).
// Builds 15 of the 16 rows in docs/specs/LS-3.md §3; the `missing-font` row CANNOT be
// scripted (loadFontAsync fails for unavailable fonts by definition) — follow the manual
// procedure in fixtures/kitchen-sink.md after running this, then save as kitchen-sink.fig.
// Main thread only. Never ships: wire behind import.meta.env.DEV in the UI, same pattern
// as the LS-2 roundtrip and LS-3 traversal harnesses.

const REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const BOLD: FontName = { family: 'Inter', style: 'Bold' };

const LOREM =
	'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly over it again and again.';

export interface KitchenSinkReport {
	created: string[];
	manualSteps: string[];
}

const COL_W = 360;
const ROW_H = 240;
const GAP = 40;

export async function generateKitchenSink(): Promise<KitchenSinkReport> {
	if (figma.currentPage.children.length > 0) {
		throw new Error('generateKitchenSink: current page is not empty — run this in a fresh file/page.');
	}
	figma.currentPage.name = 'kitchen-sink';

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

	function makeText(name: string, characters: string, parent: FrameNode & ChildrenMixin): TextNode {
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
		t.resize(200, t.height); // fixed width; height re-derives
	}

	// ── 3. fixed ───────────────────────────────────────────────────────────────
	{
		const f = makeFrame('fixed');
		const t = makeText('fixed', LOREM, f);
		t.textAutoResize = 'NONE';
		t.resize(200, 60);
	}

	// ── 4. truncating ──────────────────────────────────────────────────────────
	{
		const f = makeFrame('truncating');
		const t = makeText('truncating', LOREM + ' ' + LOREM, f);
		t.textAutoResize = 'NONE';
		t.resize(200, 60);
		t.textTruncation = 'ENDING';
		// Figma reports textAutoResize as TRUNCATE for this combination — expected, do not "fix" to NONE.
		// ── 4b. truncating-maxlines ────────────────────────────────────────────────
		{
			const f = makeFrame('truncating-maxlines');
			const t = makeText('truncating-maxlines', LOREM + ' ' + LOREM, f);
			t.textAutoResize = 'HEIGHT';
			t.resize(200, t.height);
			t.textTruncation = 'ENDING';
			t.maxLines = 2;
		}
	}

	// ── 5. autolayout-maxheight ────────────────────────────────────────────────
	{
		const f = makeFrame('autolayout-maxheight');
		f.layoutMode = 'VERTICAL';
		f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 20;
		const t = makeText('autolayout-maxheight', LOREM, f);
		t.textAutoResize = 'HEIGHT';
		t.layoutSizingHorizontal = 'FILL';
		t.maxHeight = 80;
	}

	// ── 6. mixed-font ──────────────────────────────────────────────────────────
	{
		const f = makeFrame('mixed-font');
		const t = makeText('mixed-font', 'Half regular half bold', f);
		t.setRangeFontName(0, Math.floor(t.characters.length / 2), BOLD);
	}

	// ── 7. missing-font — NOT SCRIPTABLE, manual step (see report) ─────────────
	makeFrame('missing-font'); // empty labelled frame as the placement target

	// ── 8. empty ───────────────────────────────────────────────────────────────
	{
		const f = makeFrame('empty');
		makeText('empty', '', f);
	}

	// ── 9. nested-instance (frame → instance → instance → text) ───────────────
	{
		const masters = makeFrame('_masters');
		masters.visible = false; // effective-hidden; harness matches labels, not counts

		const compA = figma.createComponent();
		compA.name = '_master-a';
		compA.resize(200, 60);
		masters.appendChild(compA);
		makeText('_master-a-text', 'Component A text', compA as unknown as FrameNode);

		const compB = figma.createComponent();
		compB.name = '_master-b';
		compB.resize(220, 80);
		masters.appendChild(compB);
		const instA = compA.createInstance();
		compB.appendChild(instA);

		const f = makeFrame('nested-instance');
		const instB = compB.createInstance();
		f.appendChild(instB);
		instB.x = 20;
		instB.y = 20;
		const inner = instB.findOne((n) => n.type === 'TEXT') as TextNode | null;
		if (inner) {
			inner.name = 'nested-instance';
			created.push('nested-instance');
		}

		// ── 10. component-override (instance of A, characters overridden) ──────
		const f2 = makeFrame('component-override');
		const instOv = compA.createInstance();
		f2.appendChild(instOv);
		instOv.x = 20;
		instOv.y = 20;
		const ovText = instOv.findOne((n) => n.type === 'TEXT') as TextNode | null;
		if (ovText) {
			ovText.name = 'component-override';
			ovText.characters = 'component-override'; // exact value the LS-3 harness golden expects
			created.push('component-override');
		}
	}

	// ── 11. in-group + in-group-boolean ────────────────────────────────────────
	{
		const f = makeFrame('in-group');
		const t = makeText('in-group', 'Text in a plain group', f);
		const r = figma.createRectangle();
		r.resize(80, 40);
		f.appendChild(r);
		r.x = 20;
		r.y = 80;
		figma.group([t, r], f);

		const t2 = makeText('in-group-boolean', 'Text in a boolean group', f);
		t2.y = 140;
		const r2 = figma.createRectangle();
		r2.resize(80, 40);
		f.appendChild(r2);
		r2.x = 20;
		r2.y = 160;
		figma.union([t2, r2], f);
	}

	// ── 12. zero-size (Figma floors dimensions at 0.01) ────────────────────────
	{
		const f = makeFrame('zero-size');
		const t = makeText('zero-size', 'x', f);
		t.textAutoResize = 'NONE';
		t.resizeWithoutConstraints(0.01, 0.01);
	}

	// ── 13. rotated ────────────────────────────────────────────────────────────
	{
		const f = makeFrame('rotated');
		const t = makeText('rotated', 'Rotated 30 degrees', f);
		t.rotation = 30;
	}

	// ── 14–16. visibility / lock flags ─────────────────────────────────────────
	{
		const f = makeFrame('hidden-self');
		const t = makeText('hidden-self', 'Self-hidden text', f);
		t.visible = false;
	}
	{
		const f = makeFrame('hidden-ancestor');
		makeText('hidden-ancestor', 'Visible text, hidden frame', f);
		f.visible = false;
	}
	{
		const f = makeFrame('locked-ancestor');
		makeText('locked-ancestor', 'Unlocked text, locked frame', f);
		f.locked = true;
	}

	// ── selection-scope (required by the LS-3 harness's selection assertion) ───
	{
		const f = makeFrame('selection-scope');
		const a = makeText('scope-a', 'Selection scope A', f);
		const b = makeText('scope-b', 'Selection scope B', f);
		a.y = 20;
		b.y = 80;
	}

	// ── README frame ───────────────────────────────────────────────────────────
	const manualSteps = [
		'missing-font: install an uncommon LOCAL font, apply it to a text node named "missing-font" inside the missing-font frame, save, uninstall the font, restart Figma, verify the missing-font indicator. Record the font family below.',
		'Fill in: missing-font family = ________, generated on = ________.',
		'Verify row 4 (truncating) shows visible truncation, then run the LS-3 traversal check.',
		'Save as fixtures/kitchen-sink.fig (or record the shared-Figma link in fixtures/README.md).',
	];
	{
		const readme = figma.createFrame();
		readme.name = 'README';
		readme.x = 0;
		readme.y = 0;
		readme.resize(4 * (COL_W + GAP) - GAP, 240);
		figma.currentPage.appendChild(readme);
		const t = figma.createText();
		t.name = '_readme-text';
		t.fontName = REGULAR;
		t.characters =
			'kitchen-sink.fig — FIX-1 / LS-17. Build sheet: docs/specs/LS-3.md §3; authoring doc: fixtures/kitchen-sink.md.\n' +
			'Generated by generateKitchenSink (dev-only). MANUAL STEPS REMAINING:\n\n' +
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
