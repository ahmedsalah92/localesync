// src/main/devtools/generateExportCases.ts
// Dev-only fixture bootstrapper for fixtures/export-cases.fig (LS-18 / FIX-2).
//
// Why this exists: the LS-18 goldens must be anchored to a REAL Gleef export, and Gleef is a Figma
// plugin that reads text layers off a canvas — it cannot be handed a JSON file. So the 42 cases in
// fixtures/export-cases.json have to EXIST as text nodes before Gleef can be run over them. This
// builds that file.
//
// Structure mirrors the keys. A case key is split on '.': every segment but the last becomes a
// frame, the last names the text layer, and the value becomes its characters. `home.title` is a
// layer `title` in frame `home`; `home.title.sub` is a layer `sub` in frame `title` in frame `home`
// — so frame `home` ends up holding both a TEXT named `title` and a FRAME named `title`. That is
// legal in Figma and it is the point: it reproduces the leaf/branch collision on the canvas, so
// Gleef's own export has to answer it too. It also means LS-9 derives the fixture's own keys back
// out of the structure, which is what makes this file reusable as an end-to-end check later.
//
// Container: one GROUP named `export-cases`, never a frame — groups are not frame-like, so the
// wrapper contributes no key segment. A frame here would prefix all 42 keys (`home.title` →
// `export_cases.home.title`) and break the correspondence above. Same reasoning as
// generateExtractKeys.ts.
//
// The read-back is the load-bearing part. Figma is free to normalise what you write to
// `characters`, and several cases exist precisely because they are normalisation-prone: U+2028
// (#9), a combining acute that NFC would fold into row 29 (#30), a trailing space (#36), and
// whitespace-only content (#32). After building, every node is read back and compared to the value
// it was given; any disagreement is reported as a blocking manual step. Without it, a fixture that
// silently lost U+2028 would anchor the spec to a character it never tested.
//
// Main thread only. Never ships: wired behind import.meta.env.DEV in main.ts.

const REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const ROOT = 'export-cases';

const COLS = 6;
const SLOT_W = 360;
const SLOT_H = 260;

/** Values longer than this get a fixed width so one long row cannot span the whole canvas. */
const WIDE_VALUE_CHARS = 60;
const WRAPPED_WIDTH = 280;

/**
 * Transcription of fixtures/export-cases.json — `n`, `key` and `value` only; the fixture's `group`,
 * `nodeId` and `exercises` are documentation and play no part in building the canvas.
 *
 * The main-thread tsconfig has neither `resolveJsonModule` nor the fixtures directory in its
 * `include`, so this cannot import the fixture directly the way key.test.ts does. It is therefore a
 * hand transcription — and generateExportCases.test.ts diffs it against the fixture on every
 * `npm test`, so the two cannot drift apart silently.
 */
export interface ExportCase {
	n: number;
	key: string;
	value: string;
}

export const EXPORT_CASES: readonly ExportCase[] = [
	{ n: 1, key: 'home.title', value: 'Welcome back' },

	{ n: 2, key: 'home.greeting_quote', value: 'He said "hi"' },
	{ n: 3, key: 'cart.item_apostrophe', value: "Don't forget your bag" },
	{ n: 4, key: 'auth.sign_in_mixed', value: '"Don\'t" she said' },

	{ n: 5, key: 'path.windows_example', value: 'C:\\Users\\name' },
	{ n: 6, key: 'debug.escape_token', value: 'Line A\\nLine B' },

	{ n: 7, key: 'address.multiline', value: '12 High Street\nLondon' },
	{ n: 8, key: 'table.column_gap', value: 'Name\tQuantity' },
	{ n: 9, key: 'paragraph.line_separator', value: 'First line\u2028Second line' },

	{ n: 10, key: 'legal.terms_link', value: 'Terms & Conditions' },
	{ n: 11, key: 'compare.range_hint', value: 'Use 5 > 3 and 2 < 4' },
	{ n: 12, key: 'entity.already_escaped', value: '&amp; is how you write an ampersand' },
	{ n: 13, key: 'format.bold_markup', value: 'Use <b>bold</b> for emphasis' },

	{ n: 14, key: 'mention.handle', value: '@designer' },
	{ n: 15, key: 'help.shortcut', value: '?shortcuts' },

	{ n: 16, key: 'cart.item_count', value: 'You have {{count}} items' },
	{ n: 17, key: 'profile.greeting', value: 'Hello, {{name}}!' },
	{ n: 18, key: 'ios.welcome', value: 'Welcome, %@' },
	{ n: 19, key: 'android.welcome', value: 'Welcome, %1$s' },
	{ n: 20, key: 'dotnet.greeting', value: 'Hello, {0}' },

	{ n: 21, key: 'sale.discount', value: '50% off today' },
	{ n: 22, key: 'sale.mixed_percent', value: '%1$s got 50% off' },

	{ n: 23, key: 'cart.item_one', value: '1 item' },
	{ n: 24, key: 'cart.item_other', value: '{{count}} items' },

	{ n: 25, key: 'home.title_ar', value: 'مرحبا بك' },
	{ n: 26, key: 'home.title_ja', value: 'ようこそ' },
	{ n: 27, key: 'status.shipped', value: 'Shipped 🎉' },
	{ n: 28, key: 'team.role', value: 'Engineer 👩‍💻' },
	{ n: 29, key: 'name.cafe_precomposed', value: 'Café' },
	{ n: 30, key: 'name.cafe_combining', value: 'Cafe\u0301' },

	{ n: 31, key: 'footer.spacer', value: '' },
	{ n: 32, key: 'footer.indent', value: '   ' },

	{ n: 33, key: 'settings.save', value: 'Save' },
	{ n: 34, key: 'profile.save', value: 'Save' },
	{ n: 35, key: 'editor.save', value: 'Save' },
	{ n: 36, key: 'dialog.save_confirm', value: 'Save ' },

	{ n: 37, key: 'home.title.sub', value: 'Good to see you' },
	{ n: 38, key: 'nav.item_2', value: 'Second item' },
	{ n: 39, key: 'nav.item.2', value: 'Item two' },
	{ n: 40, key: '2024.summary', value: 'Annual summary' },

	{ n: 41, key: 'docs.link', value: 'Visit https://example.com/docs?q=1&lang=en' },

	{
		n: 42,
		key: 'legal.disclaimer',
		value: 'This product is provided on an as-is basis without warranties of any kind, either express or implied, including but not limited to the implied warranties of merchantability and fitness for a particular purpose, to the fullest extent permitted by applicable law.',
	},
];

export interface ExportCasesReport {
	created: string[];
	manualSteps: string[];
}

/** The frame chain (outermost-first) and the leaf layer name a key describes. */
function pathOf(key: string): { frames: string[]; leaf: string } {
	const segments = key.split('.');
	const leaf = segments.pop();
	if (leaf === undefined || leaf === '') throw new Error(`generateExportCases: key '${key}' has no leaf segment`);
	return { frames: segments, leaf };
}

/** Auto-layout, hugging its content — same treatment generateExtractKeys gives its rows. */
function hug(node: FrameNode, name: string): void {
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

/** Frame-like ancestor names of `node`, nearest-first — the walk traversal/index.ts does. */
function frameChain(node: SceneNode): string[] {
	const names: string[] = [];
	let current = node.parent;
	while (current !== null && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
		if (isFrameLike(current)) names.push(current.name);
		current = current.parent;
	}
	return names;
}

export async function generateExportCases(): Promise<ExportCasesReport> {
	await figma.currentPage.loadAsync();
	const existing = figma.currentPage.children.find((node) => node.name === ROOT);
	if (existing !== undefined) {
		// Idempotent by refusal, like generateExtractKeys: a second press must not leave
		// `export-cases` and `export-cases 2` holding half the rows each.
		throw new Error(
			`generateExportCases: '${ROOT}' already exists on this page (${existing.type} ${existing.id}) — nothing created. Delete it to regenerate.`,
		);
	}
	const pageHadContent = figma.currentPage.children.length > 0;
	if (!pageHadContent) figma.currentPage.name = ROOT;

	// agent-guidelines §2: load before any `characters` write. One font covers every row — the
	// non-Latin and emoji VALUES are stored as characters regardless of whether Inter can render
	// their glyphs, and export reads characters, not glyphs.
	await figma.loadFontAsync(REGULAR);

	const created: string[] = [];
	const roots: FrameNode[] = [];

	/** Find-or-create a child frame by name, so `home` is shared by every `home.*` case. */
	function childFrame(name: string, parent: FrameNode | null): FrameNode {
		const siblings =
			parent === null ? roots : parent.children.filter((child): child is FrameNode => child.type === 'FRAME');
		const found = siblings.find((child) => child.name === name);
		if (found !== undefined) return found;

		const frame = figma.createFrame();
		hug(frame, name);
		if (parent === null) {
			frame.x = (roots.length % COLS) * SLOT_W;
			frame.y = Math.floor(roots.length / COLS) * SLOT_H;
			figma.currentPage.appendChild(frame);
			roots.push(frame);
		} else {
			parent.appendChild(frame);
		}
		return frame;
	}

	for (const testCase of EXPORT_CASES) {
		const { frames, leaf } = pathOf(testCase.key);

		let parent: FrameNode | null = null;
		for (const frameName of frames) parent = childFrame(frameName, parent);
		if (parent === null) throw new Error(`generateExportCases: key '${testCase.key}' has no frame ancestor`);

		const node = figma.createText();
		node.fontName = REGULAR;
		node.characters = testCase.value;
		// After `characters`: an explicit name sets autoRename false, so the layer keeps the key's
		// leaf segment rather than tracking its content. The read-back confirms it held.
		node.name = leaf;
		// One long row must not span the canvas. Width only — the value is untouched.
		if (testCase.value.length > WIDE_VALUE_CHARS) {
			node.textAutoResize = 'HEIGHT';
			node.resize(WRAPPED_WIDTH, node.height);
		}
		parent.appendChild(node);
		created.push(`#${testCase.n} ${testCase.key}`);
	}

	const root = figma.group(roots, figma.currentPage);
	root.name = ROOT;

	const manualSteps = [
		"Run Gleef over this file and export EVERY format it offers (i18next JSON and Android strings.xml at minimum; CSV too if offered). Gleef does not produce iOS .strings — that is expected and recorded on LS-18; the iOS rules are derived from Apple's format instead.",
		'Paste the raw Gleef output back for the LS-6 spec. Do not reformat it — indentation, entry order, trailing newline and BOM are all part of what is being anchored.',
		`Save as fixtures/export-cases.fig, share it (Anyone with the link → can view), and record the BARE link (no ?node-id= or t=) in fixtures/README.md.`,
		...(pageHadContent
			? [
					`This page already had other content, so it was not renamed. Move the '${ROOT}' group to its own page named '${ROOT}' in its own file — stray text elsewhere on the page would be picked up by Gleef and pollute the anchor.`,
				]
			: []),
	];

	const problems = verify(root);
	if (problems.length > 0) {
		manualSteps.unshift(...problems.map((problem) => `FIX BEFORE SAVING — ${problem}`));
	}

	figma.viewport.scrollAndZoomIntoView([root]);
	return { created, manualSteps };
}

/**
 * Read the canvas back against EXPORT_CASES. Compares `characters` exactly — this is what catches
 * Figma normalising a value on write, which several rows are chosen to provoke.
 */
function verify(root: GroupNode): string[] {
	const problems: string[] = [];

	const actual = new Map<string, string>();
	for (const node of root.findAllWithCriteria({ types: ['TEXT'] })) {
		const key = [...frameChain(node)].reverse().concat(node.name).join('.');
		if (actual.has(key)) {
			problems.push(`two text nodes resolve to the same path '${key}'`);
			continue;
		}
		actual.set(key, node.characters);
	}

	for (const testCase of EXPORT_CASES) {
		const got = actual.get(testCase.key);
		if (got === undefined) {
			problems.push(`#${testCase.n} '${testCase.key}': no text node at that path`);
			continue;
		}
		if (got !== testCase.value) {
			// Codepoints, not the raw strings: the rows most likely to fail here differ by an
			// invisible character, and printing them as text would show two identical-looking values.
			problems.push(
				`#${testCase.n} '${testCase.key}': characters changed on write — wrote [${codepoints(testCase.value)}], read back [${codepoints(got)}]`,
			);
		}
		actual.delete(testCase.key);
	}
	for (const key of actual.keys()) problems.push(`unexpected text node at '${key}'`);

	return problems;
}

function codepoints(value: string): string {
	return Array.from(value)
		.map((char) => {
			const code = char.codePointAt(0) ?? 0;
			return code > 32 && code < 127 ? char : `U+${code.toString(16).toUpperCase()}`;
		})
		.join(' ');
}
