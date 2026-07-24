// src/main/snapshot/check.ts  (main thread; dev-only scaffold for the "Run LS-4 snapshot check")
//
// LS-4 integration harness, main side. Registered only in dev builds (main.ts gates on
// import.meta.env.DEV). Like the LS-3 harness it piggybacks passively on page-scoped 'scan-request'
// messages and streams results to the UI as unsolicited `progress` notes ('ls4:<label>:PASS|FAIL …',
// terminated by 'ls4:done') — existing message types only (LS-4 adds none; the message union is
// frozen by messages.test.ts).
//
// UNLIKE the read-only LS-3 harness, this one MUTATES, so it must never touch the kitchen-sink
// fixture. It runs its (net-zero) apply→restore cycle ONLY when the snapshot-restore-specific label
// `instance-child` is present — a label kitchen-sink.fig does not carry — and no-ops otherwise.
// The mutation under test is a self-contained dev transform (append ' ≋≋≋'), so acceptance does not
// depend on LS-10. Blocked by FIX-1 (fixtures/snapshot-restore.fig); the pure tests are not.
//
// Scaffolding only — never run by Vitest (no `figma` runtime). Drive it from the UI's dev-only
// **Run LS-4 snapshot check** button under `npm run dev` with fixtures/snapshot-restore.fig open.
import type { BlockReason } from '../../common/models';
import { nextMainId, on, send } from '../bridge';
import { restoreAll, restoreNode, withSnapshot } from './index';

const SENTINEL_LABEL = 'instance-child'; // snapshot-restore.fig only — NOT in kitchen-sink.fig
const DEV_SUFFIX = ' ≋≋≋';
const INTER: FontName = { family: 'Inter', style: 'Regular' };

// Eligible-for-pseudoloc rows from the LS-4 §3 build sheet. legacy-truncate is authorable only from
// a legacy file, so it may be absent — the harness skips any label it doesn't find.
const ELIGIBLE_LABELS = [
	'auto-width',
	'auto-height',
	'fixed',
	'truncating',
	'legacy-truncate',
	'instance-child',
	'rotated',
	'zero-size',
];

// Rows expected to be blocked (never touched) for the char-writing `pseudoloc` op.
const EXPECTED_BLOCK: Record<string, BlockReason> = {
	'missing-font': 'missing-font',
	'mixed-font': 'mixed-font-char-mutation',
	empty: 'empty',
};

// Exactly the snapshot's own field set — a direct property-complete probe, stronger than a
// TextNodeModel projection and free of the ownBounds-vs-local-x/y rotation subtlety.
interface Probe {
	characters: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	textAutoResize: TextNode['textAutoResize'];
	textTruncation: TextNode['textTruncation'];
	maxLines: number | null;
	textAlignHorizontal: TextNode['textAlignHorizontal'];
	textAlignVertical: TextNode['textAlignVertical'];
}

function probe(node: TextNode): Probe {
	return {
		characters: node.characters,
		x: node.x,
		y: node.y,
		width: node.width,
		height: node.height,
		rotation: node.rotation,
		textAutoResize: node.textAutoResize,
		textTruncation: node.textTruncation,
		maxLines: node.maxLines,
		textAlignHorizontal: node.textAlignHorizontal,
		textAlignVertical: node.textAlignVertical,
	};
}

// Field-by-field diff; floats tolerate the 0.01 floor, everything else is exact.
function probeDiff(got: Probe, want: Probe): string[] {
	const failures: string[] = [];
	const near = (a: number, b: number) => Math.abs(a - b) <= 0.01;
	if (got.characters !== want.characters) failures.push(`characters=${JSON.stringify(got.characters)}`);
	if (!near(got.x, want.x)) failures.push(`x=${got.x} (want ${want.x})`);
	if (!near(got.y, want.y)) failures.push(`y=${got.y} (want ${want.y})`);
	if (!near(got.width, want.width)) failures.push(`width=${got.width} (want ${want.width})`);
	if (!near(got.height, want.height)) failures.push(`height=${got.height} (want ${want.height})`);
	if (!near(got.rotation, want.rotation)) failures.push(`rotation=${got.rotation} (want ${want.rotation})`);
	if (got.textAutoResize !== want.textAutoResize) failures.push(`textAutoResize=${got.textAutoResize}`);
	if (got.textTruncation !== want.textTruncation) failures.push(`textTruncation=${got.textTruncation}`);
	if (got.maxLines !== want.maxLines) failures.push(`maxLines=${String(got.maxLines)} (want ${String(want.maxLines)})`);
	if (got.textAlignHorizontal !== want.textAlignHorizontal) failures.push(`alignH=${got.textAlignHorizontal}`);
	if (got.textAlignVertical !== want.textAlignVertical) failures.push(`alignV=${got.textAlignVertical}`);
	return failures;
}

async function devMutate(node: TextNode): Promise<void> {
	// Fonts are already loaded by withSnapshot before this runs; appending is a plain characters write.
	node.characters = node.characters + DEV_SUFFIX;
	return Promise.resolve();
}

async function labelledTextNodes(): Promise<Map<string, TextNode>> {
	await figma.currentPage.loadAsync(); // dynamic-page: findAllWithCriteria throws on an unloaded page
	const byName = new Map<string, TextNode>();
	for (const node of figma.currentPage.findAllWithCriteria({ types: ['TEXT'] })) {
		if (!byName.has(node.name)) byName.set(node.name, node);
	}
	return byName;
}

// [1]+[2] apply → assert blocked reasons + eligible-applied, then [4] restore via the durable path.
async function applyRestoreCycle(byLabel: Map<string, TextNode>, notes: string[]): Promise<TextNode[]> {
	const eligible = ELIGIBLE_LABELS.filter((l) => byLabel.has(l)).map((l) => byLabel.get(l) as TextNode);
	const blockedNodes = Object.keys(EXPECTED_BLOCK)
		.filter((l) => byLabel.has(l))
		.map((l) => byLabel.get(l) as TextNode);
	const nodes = [...eligible, ...blockedNodes];

	const baseline = new Map<string, Probe>();
	for (const node of nodes) baseline.set(node.id, probe(node));

	const batch = await withSnapshot(nodes, 'pseudoloc', devMutate);

	// [2] blocked reason correct AND blocked node unchanged after apply (never touched).
	for (const [label, reason] of Object.entries(EXPECTED_BLOCK)) {
		const node = byLabel.get(label);
		if (!node) continue;
		const entry = batch.blocked.find((b) => b.nodeId === node.id);
		notes.push(
			entry?.reason === reason
				? `ls4:${label}:PASS blocked ${reason}`
				: `ls4:${label}:FAIL expected blocked ${reason}, got ${entry?.reason ?? 'not-blocked'}`,
		);
		const unchanged = probeDiff(probe(node), baseline.get(node.id) as Probe);
		notes.push(
			unchanged.length === 0
				? `ls4:${label}:PASS unchanged-after-apply`
				: `ls4:${label}:FAIL touched despite block — ${unchanged.join('; ')}`,
		);
	}

	// [1] eligible node recorded as succeeded and actually mutated on-canvas.
	for (const label of ELIGIBLE_LABELS) {
		const node = byLabel.get(label);
		if (!node) continue;
		const applied = batch.succeeded.includes(node.id) && node.characters.endsWith(DEV_SUFFIX);
		notes.push(applied ? `ls4:${label}:PASS applied` : `ls4:${label}:FAIL not applied (succeeded/characters)`);
	}

	// [4] Hard-close recovery: restoreAll reads the durable manifest + pluginData, never the in-memory
	// refs, so this is exactly the restore-on-launch path. Assert property-complete against baseline.
	const restored = await restoreAll();
	for (const label of ELIGIBLE_LABELS) {
		const node = byLabel.get(label);
		if (!node) continue;
		const diff = probeDiff(probe(node), baseline.get(node.id) as Probe);
		notes.push(
			diff.length === 0
				? `ls4:${label}:PASS restored property-complete`
				: `ls4:${label}:FAIL restore — ${diff.join('; ')}`,
		);
	}
	notes.push(`ls4:restoreAll succeeded=${restored.succeeded.length} failed=${restored.failed.length}`);
	return eligible;
}

// [3] Injected failure on the 3rd node of a batch → zero nodes mutated after the call returns, and
// the durable manifest is left clean (a follow-up restoreAll restores nothing).
async function injectedFailureCheck(eligible: TextNode[], notes: string[]): Promise<void> {
	if (eligible.length < 3) {
		notes.push('ls4:injected-failure:SKIP need >=3 eligible nodes');
		return;
	}
	const baseline = new Map<string, Probe>();
	for (const node of eligible) baseline.set(node.id, probe(node));

	let seen = 0;
	const batch = await withSnapshot(eligible, 'pseudoloc', async (node) => {
		seen += 1;
		if (seen === 3) throw new Error('injected failure on the 3rd node');
		await devMutate(node);
	});
	notes.push(
		batch.succeeded.length === 0
			? 'ls4:injected-failure:PASS zero succeeded'
			: `ls4:injected-failure:FAIL ${batch.succeeded.length} left succeeded`,
	);
	const dirty = eligible
		.map((node) => probeDiff(probe(node), baseline.get(node.id) as Probe))
		.filter((d) => d.length > 0);
	notes.push(
		dirty.length === 0
			? 'ls4:injected-failure:PASS canvas unchanged'
			: `ls4:injected-failure:FAIL ${dirty.length} node(s) left mutated`,
	);
	const after = await restoreAll();
	notes.push(
		after.succeeded.length === 0 && after.failed.length === 0
			? 'ls4:injected-failure:PASS durable-clean'
			: `ls4:injected-failure:FAIL leftover manifest (succeeded=${after.succeeded.length} failed=${after.failed.length})`,
	);
}

// [5] A node deleted between capture and restore → NODE_GONE, dropped from the manifest, no throw.
// Uses a throwaway temp node so no labelled fixture row is ever deleted.
async function nodeGoneCheck(notes: string[]): Promise<void> {
	await figma.loadFontAsync(INTER);
	const temp = figma.createText();
	temp.fontName = INTER;
	temp.characters = 'temp-node-gone';
	figma.currentPage.appendChild(temp);
	const id = temp.id;
	try {
		const batch = await withSnapshot([temp], 'pseudoloc', devMutate);
		if (batch.succeeded.length !== 1) {
			notes.push('ls4:node-gone:SKIP temp node was not snapshotted');
			temp.remove();
			return;
		}
		temp.remove(); // delete between capture and restore
		const res = await restoreNode(id);
		notes.push(
			res.restored === false && res.reason === 'NODE_GONE'
				? 'ls4:node-gone:PASS'
				: `ls4:node-gone:FAIL ${JSON.stringify(res)}`,
		);
	} catch (err) {
		notes.push(`ls4:node-gone:FAIL threw ${err instanceof Error ? err.message : String(err)}`);
	}
}

async function runChecks(): Promise<string[]> {
	const notes: string[] = [];
	const byLabel = await labelledTextNodes();
	if (!byLabel.has(SENTINEL_LABEL)) {
		return [`ls4:fixture-missing (no '${SENTINEL_LABEL}' label — open fixtures/snapshot-restore.fig)`];
	}

	const eligible = await applyRestoreCycle(byLabel, notes);
	await injectedFailureCheck(eligible, notes);
	await nodeGoneCheck(notes);
	// [6] Undo is checkpointed by commitUndo but only observable by hand.
	notes.push('ls4:undo:MANUAL apply a batch, then Cmd-Z once — the whole batch should revert as one step');
	return notes;
}

let running = false;

/** Registers the passive dev listener. The UI's **Run LS-4 snapshot check** button triggers it with
 *  an ordinary page-scoped scan-request; the LS-3 traversal check piggybacks on the same message and
 *  streams its own 'ls3:' notes, which this harness's UI driver ignores. */
export function registerSnapshotCheck(): void {
	on('scan-request', (msg) => {
		if (msg.scope !== 'page' || running) return;
		running = true;
		void runChecks()
			.catch((err: unknown) => [`ls4:error ${err instanceof Error ? err.message : String(err)}`])
			.then((notes) => {
				const all = [...notes, 'ls4:done'];
				all.forEach((note, i) =>
					send({ type: 'progress', id: nextMainId(), completed: i + 1, total: all.length, note }),
				);
			})
			.finally(() => {
				running = false;
			});
	});
}
