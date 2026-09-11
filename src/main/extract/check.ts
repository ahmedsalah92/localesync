// src/main/extract/check.ts  (main thread; dev-only scaffold for "Run LS-9 extract check")
//
// LS-9 integration harness, main side (spec §3.3). Registered only in dev builds (main.ts gates on
// import.meta.env.DEV). It piggybacks on page-scoped 'extraction-request' messages — it never
// responds (registerExtraction owns the reply) — and streams results as unsolicited `progress`
// notes ('ls9:<label>:PASS|FAIL|INFO …', terminated by 'ls9:done'), relayed to the console by
// src/ui/extract-check.ts. Existing message types only; the union is frozen by messages.test.ts.
//
// THIS HARNESS WRITES PLUGIN DATA, and briefly renames and duplicates layers (both undone before it
// finishes). It runs only when the extract-keys.fig sentinel row `collision-pair` is present — a row
// kitchen-sink.fig does not carry — so it can never stamp the shared traversal fixture (§3.3).
//
// Its passes go through extractStrings, which serializes every pass: the real handler's pass for the
// triggering request runs first, and each of this harness's passes queues behind it.
//
// Scaffolding only — never run by Vitest (no `figma` runtime). Drive it from the UI's dev-only
// "Run LS-9 extract check" button under `npm run dev` with fixtures/extract-keys.fig open.
import type { ExtractedString } from '../../common/models';
import { nextMainId, on, send } from '../bridge';
import { traverse } from '../traversal';
import type { TextNodeModel } from '../traversal/model';
import { extractStrings, type ExtractOutcome } from './index';
import { DEFAULT_SCHEME } from './key';
import { KEY_DATA, readStoredKey, serializeStoredKey } from './persist';

const SENTINEL_ROW = 'collision-pair'; // extract-keys.fig only — NOT in kitchen-sink.fig

/**
 * Expected keys per row, derived by hand from the LS-9 §2 rules applied to the shapes
 * fixtures/extract-keys.md specifies — never by calling deriveKey, which would make the check
 * circular. Each row's top-level frame is itself an ancestor, so it contributes the first segment.
 * Sets, not lists: within a row, which duplicate is first in document order is layer-panel detail.
 */
const EXPECTED: Record<string, string[]> = {
	baseline: ['baseline.checkout.summary.total'],
	'collision-pair': ['collision_pair.total', 'collision_pair.total_2'], // rule 6
	'duplicate-value': ['duplicate_value.a.label', 'duplicate_value.b.label'],
	'non-latin-name': ['non_latin_name.text'], // rule 3
	'deep-tree': ['l1.l2.l3.total'], // rule 5 — `deep-tree` itself is the outermost, and drops
	'long-name': ['long_name.a_very_long_descriptive_layer'], // rule 4
	'component-master': ['component_master.badge.label'], // rule 19
	'page-wide': ['page_wide.card.title', 'page_wide.card.title_2'], // two same-named `Card` frames
	tiebreak: ['tiebreak.label', 'tiebreak.label_2'],
};

/** Rows whose text must be absent from `entries` (rule 18). */
const EXCLUDED_ROWS = ['hidden', 'empty'];

const note = (notes: string[], label: string, ok: boolean, detail = ''): void => {
	notes.push(`ls9:${label}:${ok ? 'PASS' : 'FAIL'}${detail ? ` ${detail}` : ''}`);
};

const info = (notes: string[], label: string, detail: string): void => {
	notes.push(`ls9:${label}:INFO ${detail}`);
};

const pass = (scope: 'page' | 'selection' = 'page'): Promise<ExtractOutcome> =>
	extractStrings(scope, DEFAULT_SCHEME, () => undefined);

/** Snapshot raw stamps on `nodes`; the returned function puts them back byte-for-byte. For the
 *  assertions that forge or rewrite stamps, so a failure mid-assertion leaves no forged state. */
function holdStamps(nodes: readonly TextNode[]): () => void {
	const saved = nodes.map((node) => [node, node.getPluginData(KEY_DATA)] as const);
	return () => {
		for (const [node, raw] of saved) if (!node.removed) node.setPluginData(KEY_DATA, raw);
	};
}

async function textIn(ids: readonly string[]): Promise<TextNode[]> {
	const nodes: TextNode[] = [];
	for (const id of ids) {
		const node = await figma.getNodeByIdAsync(id);
		if (node !== null && node.type === 'TEXT') nodes.push(node);
	}
	return nodes;
}

const driftedIn = (outcome: ExtractOutcome): number => outcome.entries.filter((entry) => entry.drifted).length;

/** The row a model belongs to: its outermost frame, which by fixture convention is the row frame. */
function rowOf(model: TextNodeModel): string | undefined {
	return model.ancestorFrameNames[model.ancestorFrameNames.length - 1];
}

async function textNodes(): Promise<TextNode[]> {
	await figma.currentPage.loadAsync();
	return figma.currentPage.findAllWithCriteria({ types: ['TEXT'] });
}

/** Raw stamp per node id — the byte-level view the "writes nothing" assertion compares. */
async function rawStamps(): Promise<Map<string, string>> {
	return new Map((await textNodes()).map((node) => [node.id, node.getPluginData(KEY_DATA)]));
}

function keysOf(entries: readonly ExtractedString[], nodeIds: readonly string[]): string[] {
	const wanted = new Set(nodeIds);
	return entries.filter((entry) => wanted.has(entry.nodeId)).map((entry) => entry.key);
}

function sameSet(got: readonly string[], want: readonly string[]): boolean {
	return got.length === want.length && want.every((key) => got.includes(key));
}

async function runChecks(): Promise<string[]> {
	const notes: string[] = [];
	const models = await traverse('page');
	const byRow = new Map<string, TextNodeModel[]>();
	for (const model of models) {
		const row = rowOf(model);
		if (row === undefined) continue;
		byRow.set(row, [...(byRow.get(row) ?? []), model]);
	}
	if (!byRow.has(SENTINEL_ROW)) {
		return [`ls9:fixture-missing (no '${SENTINEL_ROW}' row — open fixtures/extract-keys.fig)`];
	}
	const idsIn = (row: string): string[] => (byRow.get(row) ?? []).map((model) => model.nodeId);

	// ── Virgin scan ────────────────────────────────────────────────────────────────────────────────
	// Clear every stamp so the pass below starts from nothing, whatever earlier runs left behind.
	// An empty value deletes the entry.
	for (const node of await textNodes()) node.setPluginData(KEY_DATA, '');
	const virgin = await pass();
	const eligible = models.filter((model) => !model.hidden && !model.empty);
	// A rejected write is reported, not a failure (rule 17) — those nodes are the probe rows below.
	const blockedIds = new Set(virgin.blocked.map((b) => b.nodeId));
	const writable = eligible.filter((model) => !blockedIds.has(model.nodeId));
	let missingStamps = 0;
	for (const model of writable) {
		const live = await figma.getNodeByIdAsync(model.nodeId);
		if (live === null || live.type !== 'TEXT' || readStoredKey(live) === null) missingStamps++;
	}
	note(
		notes,
		'virgin-stamps',
		missingStamps === 0,
		`${writable.length - missingStamps}/${writable.length} stamped, ${blockedIds.size} blocked`,
	);
	note(notes, 'virgin-drift', driftedIn(virgin) === 0, `drifted=${driftedIn(virgin)}`);

	for (const [row, want] of Object.entries(EXPECTED)) {
		if (!byRow.has(row)) {
			note(notes, `keys-${row}`, false, 'row missing from the fixture');
			continue;
		}
		const got = keysOf(virgin.entries, idsIn(row));
		note(notes, `keys-${row}`, sameSet(got, want), `got [${got.join(', ')}] want [${want.join(', ')}]`);
	}

	// ── Rule 18: hidden and empty text is absent ───────────────────────────────────────────────────
	for (const row of EXCLUDED_ROWS) {
		const ids = idsIn(row);
		if (ids.length === 0) {
			note(notes, `excluded-${row}`, false, 'row missing from the fixture');
			continue;
		}
		const leaked = keysOf(virgin.entries, ids);
		note(notes, `excluded-${row}`, leaked.length === 0, leaked.length ? `leaked [${leaked.join(', ')}]` : '');
	}

	// ── Rescan: byte-identical keys, nothing written ───────────────────────────────────────────────
	const before = await rawStamps();
	const rescan = await pass();
	const after = await rawStamps();
	const changed = [...before].filter(([id, raw]) => after.get(id) !== raw).length;
	const sameKeys =
		rescan.entries.length === virgin.entries.length &&
		rescan.entries.every((entry, i) => entry.key === virgin.entries[i]?.key);
	note(notes, 'rescan-keys', sameKeys, sameKeys ? '' : 'keys differ from the virgin pass');
	note(notes, 'rescan-writes-nothing', changed === 0, `${changed} stamp(s) changed`);
	note(notes, 'rescan-drift', driftedIn(rescan) === 0, `drifted=${driftedIn(rescan)}`);

	// ── Rename an ancestor: keys unchanged, drift rises by the affected count ─────────────────────
	const summary = figma.currentPage.findOne((n) => n.name === 'Summary' && n.type === 'FRAME');
	if (summary === null || summary.type !== 'FRAME') {
		note(notes, 'rename', false, "no frame named 'Summary' under the baseline row");
	} else {
		const affected = summary.findAllWithCriteria({ types: ['TEXT'] }).length;
		try {
			summary.name = 'Summary renamed';
			const renamed = await pass();
			const unchanged = renamed.entries.every((entry, i) => entry.key === rescan.entries[i]?.key);
			note(notes, 'rename-keys-unchanged', unchanged);
			const rise = driftedIn(renamed) - driftedIn(rescan);
			note(notes, 'rename-drift', rise === affected, `drift rose by ${rise} (expected ${affected})`);
		} finally {
			summary.name = 'Summary';
		}
	}

	// ── Duplicate a keyed node: original keeps its key (rule 9), copy takes _2 (rule 10) ──────────
	const originalId = idsIn('baseline')[0];
	const original = originalId === undefined ? null : await figma.getNodeByIdAsync(originalId);
	if (original === null || original.type !== 'TEXT' || original.parent === null) {
		note(notes, 'duplicate', false, 'baseline text node not found');
	} else {
		const originalKey = readStoredKey(original)?.k;
		let copy: TextNode | null = null;
		try {
			copy = original.clone();
			// clone() parents under the page by default; put it beside the original so it derives the same base.
			(original.parent as ChildrenMixin & BaseNode).appendChild(copy);
			// Probe 4 — does an API clone carry the stamp? A UI duplicate (Cmd-D) is recorded by hand.
			const carried = readStoredKey(copy);
			info(notes, 'probe-4', `clone() carries the stamp: ${carried !== null ? `yes (n=${carried.n})` : 'no'}`);
			const dup = await pass();
			const keyOf = (id: string) => dup.entries.find((entry) => entry.nodeId === id)?.key;
			note(
				notes,
				'duplicate-original',
				keyOf(original.id) === originalKey,
				`${keyOf(original.id)} (expected ${originalKey})`,
			);
			note(
				notes,
				'duplicate-copy',
				keyOf(copy.id) === `${originalKey}_2`,
				`${keyOf(copy.id)} (expected ${originalKey}_2)`,
			);
		} finally {
			copy?.remove();
		}
	}

	// ── Bogus owner id: the sole carrier adopts (rule 11) ──────────────────────────────────────────
	const adoptId = idsIn('long-name')[0];
	const adopter = adoptId === undefined ? null : await figma.getNodeByIdAsync(adoptId);
	const adoptStamp = adopter !== null && adopter.type === 'TEXT' ? readStoredKey(adopter) : null;
	if (adopter === null || adopter.type !== 'TEXT' || adoptStamp === null) {
		note(notes, 'adopt', false, 'long-name node or its stamp not found');
	} else {
		const restore = holdStamps([adopter]);
		let adoptedCleanly = false;
		try {
			adopter.setPluginData(
				KEY_DATA,
				serializeStoredKey({ ...adoptStamp, n: '0:0', t: adoptStamp.t ?? Date.now() }),
			);
			const adopted = await pass();
			const key = adopted.entries.find((entry) => entry.nodeId === adopter.id)?.key;
			const restamped = readStoredKey(adopter);
			adoptedCleanly = restamped?.n === adopter.id;
			note(notes, 'adopt-key', key === adoptStamp.k, `${key} (expected ${adoptStamp.k})`);
			note(notes, 'adopt-owner', adoptedCleanly, `n=${restamped?.n} (expected ${adopter.id})`);
		} finally {
			// Never leave the forged `n: '0:0'` behind.
			if (!adoptedCleanly) restore();
		}
	}

	// ── Page-wide claims: a selection pass never mints a key owned outside the selection ───────────
	// Two `Card` frames derive the same base. Card A is keyed by a selection pass over A alone; a
	// selection pass over B alone must then suffix, because A's claim is read page-wide even though
	// A is out of scope — and A's stamp must come through untouched (read, never written).
	const pageWideRow = figma.currentPage.findOne((n) => n.name === 'page-wide' && n.type === 'FRAME');
	const cards =
		pageWideRow !== null && pageWideRow.type === 'FRAME'
			? pageWideRow.children.filter((n): n is FrameNode => n.type === 'FRAME' && n.name === 'Card')
			: [];
	const [cardA, cardB] = cards;
	const titleA = cardA?.findOne((n) => n.type === 'TEXT');
	const titleB = cardB?.findOne((n) => n.type === 'TEXT');
	if (
		cardA === undefined ||
		cardB === undefined ||
		titleA?.type !== 'TEXT' ||
		titleB?.type !== 'TEXT' ||
		cards.length !== 2
	) {
		note(notes, 'page-wide', false, "row needs exactly two 'Card' frames, each holding one text node");
	} else {
		const restore = holdStamps([titleA, titleB]);
		try {
			titleA.setPluginData(KEY_DATA, '');
			titleB.setPluginData(KEY_DATA, '');
			figma.currentPage.selection = [cardA];
			await pass('selection');
			const ownerRaw = titleA.getPluginData(KEY_DATA);
			const ownerKey = readStoredKey(titleA)?.k;
			figma.currentPage.selection = [cardB];
			const scoped = await pass('selection');
			const minted = scoped.entries.find((entry) => entry.nodeId === titleB.id)?.key;
			note(
				notes,
				'page-wide-no-collision',
				minted !== undefined && ownerKey !== undefined && minted === `${ownerKey}_2`,
				`B minted ${minted} against A's ${ownerKey}`,
			);
			note(notes, 'page-wide-out-of-scope-untouched', titleA.getPluginData(KEY_DATA) === ownerRaw);
			note(
				notes,
				'page-wide-scope-returned',
				scoped.entries.length === 1,
				`${scoped.entries.length} entries (expected only B)`,
			);
		} finally {
			figma.currentPage.selection = [];
			restore();
		}
	}

	// ── Stamp-time tiebreak: two owners of one key; the older claim wins, not document order ──────
	// The winner is forged onto the LATER node in document order both times, so a document-order
	// fallback would pick the wrong one and fail loudly.
	const [early, late] = await textIn(idsIn('tiebreak'));
	if (early === undefined || late === undefined) {
		note(notes, 'tiebreak', false, "row needs two text nodes named 'Label'");
	} else {
		const restore = holdStamps([early, late]);
		const key = 'tiebreak.label';
		const keyOf = (outcome: ExtractOutcome, id: string) =>
			outcome.entries.find((entry) => entry.nodeId === id)?.key;
		try {
			early.setPluginData(KEY_DATA, serializeStoredKey({ k: key, s: 'dot', n: early.id, t: 2000 }));
			late.setPluginData(KEY_DATA, serializeStoredKey({ k: key, s: 'dot', n: late.id, t: 1000 }));
			const smaller = await pass();
			note(
				notes,
				'tiebreak-smaller-t',
				keyOf(smaller, late.id) === key && keyOf(smaller, early.id) === `${key}_2`,
				`late=${keyOf(smaller, late.id)} early=${keyOf(smaller, early.id)}`,
			);

			// A pre-`t` stamp is written raw — serializeStoredKey always emits `t`.
			early.setPluginData(KEY_DATA, serializeStoredKey({ k: key, s: 'dot', n: early.id, t: 1000 }));
			late.setPluginData(KEY_DATA, JSON.stringify({ k: key, s: 'dot', n: late.id }));
			const absent = await pass();
			note(
				notes,
				'tiebreak-absent-t',
				keyOf(absent, late.id) === key && keyOf(absent, early.id) === `${key}_2`,
				`late=${keyOf(absent, late.id)} early=${keyOf(absent, early.id)}`,
			);
		} finally {
			restore();
		}
	}

	// ── Probes 1–3 and the library-instance row: stamped or blocked, never thrown ─────────────────
	for (const [row, probe] of [
		['local-instance', 'probe-1'],
		['library-instance', 'probe-2'],
		['locked', 'probe-3'],
	] as const) {
		const ids = idsIn(row);
		if (ids.length === 0) {
			info(notes, probe, `${row} row not present — probe not run`);
			continue;
		}
		const blocked = ids.filter((id) => blockedIds.has(id)).length;
		info(notes, probe, `${row}: ${ids.length - blocked} stamped, ${blocked} blocked (instance-locked)`);
	}

	// ── Probe 7: selection on a locked node ────────────────────────────────────────────────────────
	const lockedId = idsIn('locked')[0];
	const locked = lockedId === undefined ? null : await figma.getNodeByIdAsync(lockedId);
	if (locked !== null && locked.type === 'TEXT') {
		try {
			figma.currentPage.selection = [locked];
			const landed = figma.currentPage.selection.some((n) => n.id === locked.id);
			info(notes, 'probe-7', `selection = [locked node] ${landed ? 'lands' : 'is dropped'}`);
		} catch (err) {
			info(
				notes,
				'probe-7',
				`selection = [locked node] throws: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			figma.currentPage.selection = [];
		}
	}

	notes.push(
		'ls9:undo:MANUAL clear the stamps (re-run this check), then Cmd-Z once — the whole stamp batch should revert as one step (probe 6)',
	);
	notes.push(
		'ls9:probe-5:MANUAL duplicate the file, open the copy, run this check — record whether node ids survive',
	);
	return notes;
}

let running = false;

/** Registers the passive dev listener. The UI's "Run LS-9 extract check" button triggers it with an
 *  ordinary page-scoped extraction-request; that request's own result is asserted UI-side. */
export function registerExtractionCheck(): void {
	on('extraction-request', (msg) => {
		if (msg.scope !== 'page' || running) return;
		running = true;
		void runChecks()
			.catch((err: unknown) => [`ls9:error ${err instanceof Error ? err.message : String(err)}`])
			.then((notes) => {
				const all = [...notes, 'ls9:done'];
				all.forEach((text, i) =>
					send({ type: 'progress', id: nextMainId(), completed: i + 1, total: all.length, note: text }),
				);
			})
			.finally(() => {
				running = false;
			});
	});
}
