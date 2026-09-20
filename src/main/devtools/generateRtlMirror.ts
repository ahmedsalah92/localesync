// src/main/devtools/generateRtlMirror.ts
// Dev-only fixture bootstrapper for fixtures/rtl-mirror.fig (LS-11 §3.4).
//
// Builds 11 of the 12 rows. One CANNOT be scripted:
//   • `missing-font` — loadFontAsync fails for unavailable fonts by definition; follow the manual
//     procedure in fixtures/rtl-mirror.md after running this.
//
// Every row exists to exercise a specific rule or hazard, not to look like a design. The ones that
// matter most are the ones no other fixture in the repo carries:
//   • `grid-span`       — setGridChildPosition THROWS on transient overlap, so a column permutation
//                         cannot be written one child at a time. This is where the implementation is
//                         most likely to fail on a real file.
//   • `overlap-stack`   — reversing the children array reverses PAINT order too; without the
//                         itemReverseZIndex toggle the stack silently re-stacks (F1/F2).
//   • `instance`        — instance children cannot be reparented, so F1 is impossible inside one.
//   • `absolute-badge`  — the only row where `x` is authored rather than derived (F7).
//
// Main thread only. Never ships: wired behind import.meta.env.DEV. Run in a fresh empty file/page,
// then complete the manual step and save.

const REGULAR: FontName = { family: 'Inter', style: 'Regular' };

export interface RtlMirrorReport {
	created: string[];
	manualSteps: string[];
}

const COL_W = 320;
const ROW_H = 160;
const GAP = 48;

export async function generateRtlMirror(): Promise<RtlMirrorReport> {
	if (figma.currentPage.children.length > 0) {
		throw new Error('generateRtlMirror: current page is not empty — run this in a fresh file/page.');
	}
	await figma.loadFontAsync(REGULAR);

	const created: string[] = [];
	let slot = 0;

	/** One labelled cell in the grid of rows. */
	function makeFrame(name: string): FrameNode {
		const frame = figma.createFrame();
		frame.name = name;
		frame.resize(COL_W, ROW_H);
		frame.x = (slot % 3) * (COL_W + GAP);
		frame.y = Math.floor(slot / 3) * (ROW_H + GAP);
		figma.currentPage.appendChild(frame);
		slot += 1;
		created.push(name);
		return frame;
	}

	function label(text: string, parent: FrameNode | GroupNode, width = 90): TextNode {
		const node = figma.createText();
		node.fontName = REGULAR;
		node.characters = text;
		node.textAutoResize = 'NONE';
		node.resize(width, 24);
		if (parent.type === 'FRAME') parent.appendChild(node);
		return node;
	}

	function swatch(name: string, size = 40): EllipseNode {
		const node = figma.createEllipse();
		node.name = name;
		node.resize(size, size);
		return node;
	}

	// ── 1. horizontal auto-layout: the F1/F3/F5 row ───────────────────────────
	// Asymmetric padding and MIN alignment, so the mirror has something to flip on every rule.
	{
		const frame = makeFrame('h-autolayout');
		frame.layoutMode = 'HORIZONTAL';
		frame.primaryAxisAlignItems = 'MIN';
		frame.counterAxisAlignItems = 'CENTER';
		frame.paddingLeft = 24;
		frame.paddingRight = 8;
		frame.itemSpacing = 8;
		label('Cancel', frame, 70);
		label('Save', frame, 60);
		label('Next ›', frame, 60);
	}

	// ── 2. vertical auto-layout: F4 only ──────────────────────────────────────
	// The axis trap: here the HORIZONTAL axis is the COUNTER axis. A mirror that flips `primary`
	// on this frame would reorder it vertically.
	{
		const frame = makeFrame('v-autolayout');
		frame.layoutMode = 'VERTICAL';
		frame.counterAxisAlignItems = 'MIN';
		frame.primaryAxisAlignItems = 'MIN';
		frame.itemSpacing = 6;
		label('First', frame);
		label('Second', frame);
		label('Third', frame);
	}

	// ── 3. nested auto-layout: E1 ─────────────────────────────────────────────
	// Each frame mirrors in its own coordinate space; the transform must not compound.
	{
		const outer = makeFrame('nested-outer');
		outer.layoutMode = 'HORIZONTAL';
		outer.paddingLeft = 16;
		outer.paddingRight = 4;
		outer.itemSpacing = 8;
		const inner = figma.createFrame();
		inner.name = 'nested-inner';
		inner.resize(160, 40);
		inner.layoutMode = 'HORIZONTAL';
		inner.primaryAxisAlignItems = 'MAX';
		inner.itemSpacing = 4;
		outer.appendChild(inner);
		label('in-A', inner as unknown as FrameNode, 50);
		label('in-B', inner as unknown as FrameNode, 50);
		label('outer', outer, 60);
		created.push('nested-inner');
	}

	// ── 4. wrapped horizontal auto-layout: E4 ─────────────────────────────────
	// Reversing the children reverses the sequence within the reflow, so the row breaks land
	// elsewhere. Expected, and worth an acceptance case rather than a rule.
	{
		const frame = makeFrame('wrap-row');
		frame.layoutMode = 'HORIZONTAL';
		frame.layoutWrap = 'WRAP';
		frame.itemSpacing = 6;
		frame.counterAxisSpacing = 6;
		frame.paddingLeft = 12;
		frame.paddingRight = 2;
		for (const text of ['one', 'two', 'three', 'four', 'five', 'six']) label(text, frame, 60);
	}

	// ── 5. GRID with a spanning child: F9's throw-on-overlap hazard ───────────
	// The row the whole two-phase write exists for. A 3-column grid whose top-left child spans two
	// columns: any non-identity column permutation collides mid-sequence if written one at a time.
	{
		const frame = makeFrame('grid-span');
		frame.layoutMode = 'GRID';
		frame.gridColumnCount = 3;
		frame.gridRowCount = 2;
		frame.itemSpacing = 4;
		frame.counterAxisSpacing = 4;
		const cells = ['span-2', 'c', 'd', 'e', 'f'].map((name) => {
			const cell = swatch(name, 24);
			frame.appendChild(cell);
			return cell;
		});
		const spanning = cells[0];
		if (spanning !== undefined) {
			spanning.setGridChildPosition(0, 0);
			spanning.gridColumnSpan = 2;
		}
		cells[1]?.setGridChildPosition(0, 2);
		cells[2]?.setGridChildPosition(1, 0);
		cells[3]?.setGridChildPosition(1, 1);
		cells[4]?.setGridChildPosition(1, 2);
	}

	// ── 6. absolutely-positioned badge: E2 / F7 ───────────────────────────────
	// The only row where `x` is authored rather than derived. Its constraint is MAX, so F8 must flip
	// it too — otherwise it lands correctly and then drifts on the next resize.
	{
		const frame = makeFrame('absolute-badge');
		frame.layoutMode = 'HORIZONTAL';
		frame.itemSpacing = 8;
		frame.paddingLeft = 12;
		frame.paddingRight = 12;
		label('content', frame, 100);
		const badge = swatch('badge', 16);
		frame.appendChild(badge);
		badge.layoutPositioning = 'ABSOLUTE';
		badge.x = COL_W - 24;
		badge.y = 8;
		badge.constraints = { horizontal: 'MAX', vertical: 'MIN' };
	}

	// ── 7. overlapping avatar stack: F2's z-order case ────────────────────────
	// Negative spacing makes the children overlap, so reversing the array WITHOUT toggling
	// itemReverseZIndex visibly re-stacks them. The defect is invisible on any non-overlapping row.
	{
		const frame = makeFrame('overlap-stack');
		frame.layoutMode = 'HORIZONTAL';
		frame.itemSpacing = -12;
		frame.counterAxisAlignItems = 'CENTER';
		frame.paddingLeft = 16;
		frame.paddingRight = 4;
		for (const name of ['avatar-1', 'avatar-2', 'avatar-3']) frame.appendChild(swatch(name, 32));
	}

	// ── 8. GROUP: §7.4 — no layout properties, children mirror about its bounds ─
	{
		const host = makeFrame('group-host');
		const a = swatch('g-left', 24);
		const b = swatch('g-right', 24);
		host.appendChild(a);
		host.appendChild(b);
		a.x = 16;
		a.y = 60;
		b.x = 200;
		b.y = 60;
		const group = figma.group([a, b], host);
		group.name = 'plain-group';
		created.push('plain-group');
	}

	// ── 9. instance: §2.5 — F1 impossible, F3–F8 still apply ──────────────────
	{
		const host = makeFrame('instance-host');
		const master = figma.createComponent();
		master.name = 'rtl-master';
		master.resize(200, 48);
		master.layoutMode = 'HORIZONTAL';
		master.primaryAxisAlignItems = 'MIN';
		master.paddingLeft = 20;
		master.paddingRight = 4;
		master.itemSpacing = 6;
		label('m-one', master as unknown as FrameNode, 60);
		label('m-two', master as unknown as FrameNode, 60);
		// Park the master off to the side; the instance is what the mirror walks.
		master.x = 0;
		master.y = (Math.floor(slot / 3) + 2) * (ROW_H + GAP);
		figma.currentPage.appendChild(master);
		const instance = master.createInstance();
		instance.name = 'rtl-instance';
		host.appendChild(instance);
		created.push('rtl-master', 'rtl-instance');
	}

	// ── 10. locked node: §2.6 — `locked` must NOT block the mirror ────────────
	// Proves the correction to ruleset G4 rather than assuming it: the API writes through `locked`.
	{
		const frame = makeFrame('locked-row');
		frame.layoutMode = 'HORIZONTAL';
		frame.paddingLeft = 28;
		frame.paddingRight = 4;
		frame.itemSpacing = 8;
		label('locked-a', frame, 80);
		label('locked-b', frame, 80);
		frame.locked = true;
	}

	// ── 11. mixed LTR/RTL text: E3 / G3 — flagged, never touched ──────────────
	{
		const frame = makeFrame('mixed-bidi');
		frame.layoutMode = 'VERTICAL';
		frame.counterAxisAlignItems = 'MIN';
		frame.itemSpacing = 6;
		const mixed = label('Save مرحبا now', frame, 200);
		mixed.name = 'mixed-ltr-rtl';
		mixed.textAlignHorizontal = 'LEFT';
		const plain = label('Left aligned', frame, 200);
		plain.textAlignHorizontal = 'LEFT';
	}

	figma.currentPage.name = 'rtl-mirror';
	figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);

	return {
		created,
		manualSteps: [
			'Add a `missing-font` row: a text layer in a font this machine does not have (copy one in from another file, or uninstall the font). The mirror must skip it and flag it — it is the only row proving the CLAUDE.md missing-font hard rule on the layout path.',
			'Rename the file to rtl-mirror.fig and record its link in fixtures/README.md.',
			'Sanity-check `grid-span` by eye: the spanning cell should occupy columns 0–1 of row 0.',
		],
	};
}
