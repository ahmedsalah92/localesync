// src/main/devtools/generatePreview.ts
// Dev-only fixture bootstrapper for fixtures/preview.fig (LS-12 §3.2). The authority is
// fixtures/preview.md; this builds every row the Plugin API can produce. Two cannot be scripted:
//   • `missing-font` — loadFontAsync fails for an unavailable font by definition (as rtl-mirror.md);
//   • the copy of `title` — it must be made AFTER the Extract scan, so it carries the original's
//     stamp and is not an owner. A clone made here would be stamped as an owner of its own.
//
// Keys come from LS-9's derivation (dot scheme) over this structure, and the import files in
// fixtures/preview/ were written from those rules — so the frame and layer names are load-bearing:
//   • `title` / `cta` / `fallback` / `mixed` sit directly in frame `preview` → `preview.<name>`;
//   • `inst` sits inside an INSTANCE named `badge`, which is frame-like (LS-9 rule 5) and so adds a
//     segment → `preview.badge.inst`;
//   • the `badge` master lives in its own frame `components` → `components.badge.inst`, a fallback
//     owner in every language. Kept out of `preview` so the two `inst` layers cannot collide on one
//     key and pick up an order-dependent suffix.
//
// Creates NO plugin data: the Extract scan stamps, and the harness seeds the store at runtime.
//
// Main thread only. Never ships: wired behind import.meta.env.DEV in main.ts.

const REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const MEDIUM: FontName = { family: 'Inter', style: 'Medium' };

export interface PreviewFixtureReport {
	created: string[];
	manualSteps: string[];
}

/** Every text node the generator builds: [frame chain nearest-first, name, characters]. Kept apart
 *  from the build code so the read-back compares two transcriptions, not one against itself. */
const EXPECTED_TEXT: { frames: string[]; name: string; characters: string }[] = [
	{ frames: ['preview'], name: 'title', characters: 'Welcome back' },
	{ frames: ['preview'], name: 'cta', characters: 'Add to cart' },
	{ frames: ['preview'], name: 'fallback', characters: 'Only in English' },
	{ frames: ['preview'], name: 'mixed', characters: 'Mixed' },
	{ frames: ['badge', 'preview'], name: 'inst', characters: 'Instance text' },
	{ frames: ['badge', 'components'], name: 'inst', characters: 'Instance text' },
];

type Container = FrameNode | ComponentNode;

function hug(node: Container, name: string): void {
	node.name = name;
	node.layoutMode = 'VERTICAL';
	node.primaryAxisSizingMode = 'AUTO';
	node.counterAxisSizingMode = 'AUTO';
	node.paddingTop = 16;
	node.paddingBottom = 16;
	node.paddingLeft = 16;
	node.paddingRight = 16;
	node.itemSpacing = 8;
}

function isFrameLike(node: BaseNode): boolean {
	return (
		node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE'
	);
}

function frameChain(node: SceneNode): string[] {
	const names: string[] = [];
	let current = node.parent;
	while (current !== null && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
		if (isFrameLike(current)) names.push(current.name);
		current = current.parent;
	}
	return names;
}

export async function generatePreview(): Promise<PreviewFixtureReport> {
	await figma.currentPage.loadAsync();
	if (figma.currentPage.children.length > 0) {
		throw new Error('generatePreview: current page is not empty — run this in a fresh file/page.');
	}
	// agent-guidelines §2: load before any `characters` or range-font write.
	await figma.loadFontAsync(REGULAR);
	await figma.loadFontAsync(MEDIUM);

	const created: string[] = [];

	function text(name: string, characters: string, parent: Container, path: string): TextNode {
		const node = figma.createText();
		node.fontName = REGULAR;
		node.characters = characters;
		// After `characters`: an explicit name turns autoRename off, so the layer keeps this name.
		node.name = name;
		parent.appendChild(node);
		created.push(path);
		return node;
	}

	// ── components — the `badge` master, outside `preview` (see header) ──────────────────────────
	const components = figma.createFrame();
	hug(components, 'components');
	components.x = 400;
	figma.currentPage.appendChild(components);
	const badge = figma.createComponent();
	hug(badge, 'badge');
	components.appendChild(badge);
	text('inst', 'Instance text', badge, 'components › badge (component) › inst');

	// ── preview — the frame every assertion reads ────────────────────────────────────────────────
	const preview = figma.createFrame();
	hug(preview, 'preview');
	figma.currentPage.appendChild(preview);
	text('title', 'Welcome back', preview, 'preview › title');
	text('cta', 'Add to cart', preview, 'preview › cta');
	text('fallback', 'Only in English', preview, 'preview › fallback');
	// Two styles → fontName === figma.mixed → the snapshot gate blocks it `mixed-font-char-mutation`.
	const mixed = text('mixed', 'Mixed', preview, 'preview › mixed (Regular + Medium)');
	mixed.setRangeFontName(Math.floor(mixed.characters.length / 2), mixed.characters.length, MEDIUM);
	const instance = badge.createInstance();
	preview.appendChild(instance);
	created.push('preview › badge (instance) › inst');

	const manualSteps = [
		"missing-font: add a text layer in a font this machine does NOT have, INSIDE the 'preview' frame, named `missing-font`, text 'Font gone' (fixtures/preview.md).",
		'Extract: run an Extract page scan (dot scheme) so every text layer is stamped.',
		"Copy: select `title` in 'preview' and duplicate it (Cmd-D) — AFTER the scan, so the copy carries the original's stamp.",
		'Save as fixtures/preview.fig and record the bare link in fixtures/README.md.',
		'Run the LS-12 check: "Run LS-12 preview check" → every ls12: line PASS in the console, then the MANUAL Cmd-Z step.',
	];

	const problems = verify([preview, components]);
	if (problems.length > 0) manualSteps.unshift(...problems.map((problem) => `FIX BEFORE SAVING — ${problem}`));

	figma.viewport.scrollAndZoomIntoView([preview, components]);
	return { created, manualSteps };
}

function verify(roots: FrameNode[]): string[] {
	const problems: string[] = [];
	const describe = (entry: { frames: string[]; name: string; characters: string }) =>
		`${entry.name} in ${entry.frames.join(' < ')} = '${entry.characters}'`;

	const got: string[] = [];
	for (const root of roots) {
		for (const node of root.findAllWithCriteria({ types: ['TEXT'] })) {
			got.push(describe({ frames: frameChain(node), name: node.name, characters: node.characters }));
			if (node.getPluginDataKeys().length > 0) problems.push(`'${node.name}' carries plugin data`);
			const isMixed = node.fontName === figma.mixed;
			if (node.name === 'mixed' && !isMixed) problems.push("'mixed' has a single font — it would not be blocked");
			if (node.name !== 'mixed' && isMixed) problems.push(`'${node.name}' has mixed fonts`);
		}
	}
	const want = EXPECTED_TEXT.map(describe).sort();
	got.sort();
	if (want.join('\n') !== got.join('\n')) {
		problems.push(`text layers: expected [${want.join('; ')}], found [${got.join('; ')}]`);
	}
	return problems;
}
