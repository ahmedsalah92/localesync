// src/main/devtools/generateExtractKeys.ts
// Dev-only fixture bootstrapper for fixtures/extract-keys.fig (LS-9 §3.3). The row list is
// fixtures/extract-keys.md — that doc is the authority, and this builds every row of it the Plugin
// API can produce: 13 of 14. `library-instance` CANNOT be scripted — it needs an instance of a
// component from a *published* team library, which the API cannot publish. It gets an empty
// placeholder frame and a manual step.
//
// Why a generator at all: the rows are pure structure — frame nesting, layer names, characters — and
// a mistake there fails silently. A 48-character name mistyped, or a frame nested three deep instead
// of four, makes the harness assert a different key than LS-9 §3.2 predicts, and the bug looks like
// it lives in key.ts. So after building, this READS BACK every text node (name, characters, frame
// chain, flags, plugin data) against EXPECTED_TEXT — a second, independent transcription of the doc's
// table — and reports any disagreement as a manual step to fix before the file is saved.
//
// Container: everything is wrapped in one GROUP named `extract-keys`, never a frame. The harness
// assigns a text node to its row by its OUTERMOST frame ancestor, and key derivation counts frame
// ancestors — an `extract-keys` frame would become every node's row (the `collision-pair` sentinel
// would vanish) and prefix shallow keys (`collision_pair.total` → `extract_keys.collision_pair.total`).
// Groups are not frame-like, so they contribute neither.
//
// Creates NO plugin data: the fixture ships clean. The harness clears, stamps and forges stamps at
// runtime, and undoes its forgeries in `finally`.
//
// Main thread only. Never ships: wired behind import.meta.env.DEV in main.ts.

const REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const ROOT = 'extract-keys';

export interface ExtractKeysReport {
	created: string[];
	manualSteps: string[];
}

/**
 * Every text node the fixture must contain, per row, transcribed from fixtures/extract-keys.md's row
 * inventory. `frames` is the frame-like ancestor chain nearest-first, as TextNodeModel stores it; its
 * last element is the row. Kept separate from the build code on purpose — the read-back compares the
 * canvas against this, so a slip in either one shows up as a disagreement instead of agreeing with
 * itself.
 */
const EXPECTED_TEXT: Record<string, { name: string; frames: string[] }[]> = {
	baseline: [{ name: 'Total', frames: ['Summary', 'Checkout', 'baseline'] }],
	'collision-pair': [
		{ name: 'Total', frames: ['collision-pair'] },
		{ name: 'Total', frames: ['collision-pair'] },
	],
	'duplicate-value': [
		{ name: 'Label', frames: ['A', 'duplicate-value'] },
		{ name: 'Label', frames: ['B', 'duplicate-value'] },
	],
	'non-latin-name': [{ name: 'الإجمالي', frames: ['non-latin-name'] }],
	'deep-tree': [{ name: 'Total', frames: ['L3', 'L2', 'L1', 'deep-tree'] }],
	'long-name': [{ name: 'A very long descriptive layer name for the total', frames: ['long-name'] }],
	'component-master': [{ name: 'Label', frames: ['Badge', 'component-master'] }],
	'local-instance': [{ name: 'Label', frames: ['Badge', 'local-instance'] }],
	'library-instance': [], // manual — the placeholder frame is empty until a library instance is placed
	locked: [{ name: 'Label', frames: ['locked'] }],
	'page-wide': [
		{ name: 'Title', frames: ['Card', 'page-wide'] },
		{ name: 'Title', frames: ['Card', 'page-wide'] },
	],
	tiebreak: [
		{ name: 'Label', frames: ['tiebreak'] },
		{ name: 'Label', frames: ['tiebreak'] },
	],
	hidden: [{ name: 'Hidden', frames: ['hidden'] }],
	empty: [{ name: 'Empty', frames: ['empty'] }],
};

const COLS = 4;
const SLOT_W = 360;
const SLOT_H = 240;

type Container = FrameNode | ComponentNode;

/** Auto-layout, hugging its content — keeps the rows legible without hand-placed coordinates. */
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

/** The frame-like ancestor names of `node`, nearest-first — the same walk traversal/index.ts does. */
function frameChain(node: SceneNode): string[] {
	const names: string[] = [];
	let current = node.parent;
	while (current !== null && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
		if (isFrameLike(current)) names.push(current.name);
		current = current.parent;
	}
	return names;
}

export async function generateExtractKeys(): Promise<ExtractKeysReport> {
	await figma.currentPage.loadAsync();
	const existing = figma.currentPage.children.find((node) => node.name === ROOT);
	if (existing !== undefined) {
		// Idempotent by refusal: a second press must not leave `extract-keys` and `extract-keys 2` with
		// half the rows in each.
		throw new Error(
			`generateExtractKeys: '${ROOT}' already exists on this page (${existing.type} ${existing.id}) — nothing created. Delete it to regenerate.`,
		);
	}
	const pageHadContent = figma.currentPage.children.length > 0;
	if (!pageHadContent) figma.currentPage.name = ROOT;

	// agent-guidelines §2: load before any `characters` write.
	await figma.loadFontAsync(REGULAR);

	const created: string[] = [];
	const rows: FrameNode[] = [];

	function row(label: string): FrameNode {
		const frame = figma.createFrame();
		hug(frame, label);
		frame.x = (rows.length % COLS) * SLOT_W;
		frame.y = Math.floor(rows.length / COLS) * SLOT_H;
		figma.currentPage.appendChild(frame);
		rows.push(frame);
		return frame;
	}

	function frame(name: string, parent: Container): FrameNode {
		const child = figma.createFrame();
		hug(child, name);
		parent.appendChild(child);
		return child;
	}

	function text(name: string, characters: string, parent: Container, path: string): TextNode {
		const node = figma.createText();
		node.fontName = REGULAR;
		node.characters = characters;
		// After `characters`: an explicit name sets autoRename to false, so the layer keeps this name
		// rather than tracking its content. The read-back below confirms it held.
		node.name = name;
		parent.appendChild(node);
		created.push(path);
		return node;
	}

	// ── baseline — rules 1–2; the harness's rename and duplicate targets ─────────────────────────
	{
		const r = row('baseline');
		const summary = frame('Summary', frame('Checkout', r));
		text('Total', '$42.00', summary, 'baseline › Checkout › Summary › Total');
	}

	// ── collision-pair — rule 6; also the harness's sentinel row ─────────────────────────────────
	{
		const r = row('collision-pair');
		text('Total', '$10.00', r, 'collision-pair › Total');
		text('Total', '$12.00', r, 'collision-pair › Total (2)');
	}

	// ── duplicate-value — marker 26: identical characters in different frames ─────────────────────
	{
		const r = row('duplicate-value');
		text('Label', 'Save', frame('A', r), 'duplicate-value › A › Label');
		text('Label', 'Save', frame('B', r), 'duplicate-value › B › Label');
	}

	// ── non-latin-name — rule 3. The NAME is non-Latin; characters are Latin, so no extra font ────
	{
		const r = row('non-latin-name');
		text('الإجمالي', 'Total', r, 'non-latin-name › الإجمالي');
	}

	// ── deep-tree — rule 5: the row frame makes the text four frames deep ─────────────────────────
	{
		const r = row('deep-tree');
		const l3 = frame('L3', frame('L2', frame('L1', r)));
		text('Total', '$42.00', l3, 'deep-tree › L1 › L2 › L3 › Total');
	}

	// ── long-name — rule 4; the harness's adoption target ─────────────────────────────────────────
	{
		const r = row('long-name');
		text('A very long descriptive layer name for the total', '$42.00', r, 'long-name › A very long …');
	}

	// ── component-master + local-instance — rule 19 and probe 1 ───────────────────────────────────
	{
		const r = row('component-master');
		const badge = figma.createComponent();
		hug(badge, 'Badge');
		r.appendChild(badge);
		text('Label', 'New', badge, 'component-master › Badge (component) › Label');

		const instanceRow = row('local-instance');
		const instance = badge.createInstance();
		instanceRow.appendChild(instance);
		// The instance's text is Figma's copy of the master's, name included — recorded, not created.
		created.push('local-instance › Badge (instance) › Label');
	}

	// ── library-instance — probe 2. NOT SCRIPTABLE: placeholder frame only ────────────────────────
	row('library-instance');

	// ── locked — probes 3 and 7. Content first, then the lock ────────────────────────────────────
	{
		const r = row('locked');
		text('Label', 'Locked', r, 'locked › Label (locked)').locked = true;
	}

	// ── page-wide — two same-named Card frames, so both derive one base across a selection edge ──
	{
		const r = row('page-wide');
		text('Title', 'First card', frame('Card', r), 'page-wide › Card › Title');
		text('Title', 'Second card', frame('Card', r), 'page-wide › Card (2) › Title');
	}

	// ── tiebreak — two plain layers; the harness forges their stamps at runtime ──────────────────
	{
		const r = row('tiebreak');
		text('Label', 'Tie A', r, 'tiebreak › Label');
		text('Label', 'Tie B', r, 'tiebreak › Label (2)');
	}

	// ── hidden / empty — rule 18 ──────────────────────────────────────────────────────────────────
	{
		text('Hidden', 'Hidden text', row('hidden'), 'hidden › Hidden (visibility off)').visible = false;
		text('Empty', '', row('empty'), 'empty › Empty (no characters)');
	}

	const root = figma.group(rows, figma.currentPage);
	root.name = ROOT;

	const manualSteps = [
		"library-instance: place an instance of a text-bearing component from a PUBLISHED team library inside the 'library-instance' frame. This needs library publishing on the plan. If it is unavailable, leave the frame empty — probe 2 stays unresolved, which is survivable: writeStoredKey returns false on a rejected write and the code path is identical either way.",
		...(pageHadContent
			? [
					`This page already had other content, so it was not renamed. Move the '${ROOT}' group to its own page named '${ROOT}' in its own file — stray text elsewhere on the page is extracted and stamped too, and a second frame named 'Summary' breaks the rename check.`,
				]
			: []),
		'Save as fixtures/extract-keys.fig, share it (Anyone with the link → can view), and record the BARE link (no ?node-id= or t=) in fixtures/README.md.',
		'Run the LS-9 check: npm run dev → open this file → "Run LS-9 extract check" → every ls9: line PASS in the console, then do the manual probes in fixtures/extract-keys.md.',
	];

	// ── Read-back: the canvas against EXPECTED_TEXT ───────────────────────────────────────────────
	const problems = verify(root);
	if (problems.length > 0) {
		manualSteps.unshift(...problems.map((problem) => `FIX BEFORE SAVING — ${problem}`));
	}

	figma.viewport.scrollAndZoomIntoView([root]);
	return { created, manualSteps };
}

function verify(root: GroupNode): string[] {
	const problems: string[] = [];
	const describe = (entry: { name: string; frames: string[] }) => `${entry.name} in ${entry.frames.join(' < ')}`;

	const actual = new Map<string, string[]>();
	for (const node of root.findAllWithCriteria({ types: ['TEXT'] })) {
		const frames = frameChain(node);
		const rowName = frames[frames.length - 1] ?? '(no row frame)';
		actual.set(rowName, [...(actual.get(rowName) ?? []), describe({ name: node.name, frames })]);

		if (node.getPluginDataKeys().length > 0) problems.push(`'${node.name}' in ${rowName} carries plugin data`);
		if (rowName === 'locked' && !node.locked) problems.push("the 'locked' row's text is not locked");
		if (rowName === 'hidden' && node.visible) problems.push("the 'hidden' row's text is visible");
		if (rowName === 'empty' && node.characters !== '') problems.push("the 'empty' row's text has characters");
		if (rowName !== 'empty' && node.characters === '') problems.push(`'${node.name}' in ${rowName} is empty`);
		if (rowName === 'duplicate-value' && node.characters !== 'Save') {
			problems.push(`duplicate-value text reads '${node.characters}', not 'Save'`);
		}
	}

	for (const [rowName, entries] of Object.entries(EXPECTED_TEXT)) {
		const want = entries.map(describe).sort();
		const got = (actual.get(rowName) ?? []).sort();
		if (want.join('\n') !== got.join('\n')) {
			problems.push(`row '${rowName}': expected [${want.join('; ')}], found [${got.join('; ')}]`);
		}
		actual.delete(rowName);
	}
	for (const rowName of actual.keys()) problems.push(`unexpected row '${rowName}' holding text`);

	const rowFrames = root.children.filter((child) => child.type === 'FRAME').map((child) => child.name);
	const missing = Object.keys(EXPECTED_TEXT).filter((label) => !rowFrames.includes(label));
	if (missing.length > 0) problems.push(`missing row frames: ${missing.join(', ')}`);
	return problems;
}
