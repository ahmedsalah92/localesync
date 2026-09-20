// src/main/rtl/check.ts  (main thread; dev-only scaffold for "Run LS-11 RTL check")
//
// LS-11 integration harness (spec §3.3). Canvas mutation and byte-identical restore are not things
// Vitest can prove — a faked `figma` cannot carry them (agent-guidelines §6) — so every assertion
// here needs the real runtime. The pure rules are covered by `mirror.test.ts`; this covers the half
// that touches the graph.
//
// Driven by a `__dev:rtl-check` sentinel, like LS-10's harness. Notes go to the main-thread console.
//
// **It mutates the canvas and restores it.** Every path ends in a revert, including the failure
// paths, and anything it cannot restore is left in the durable manifest for restore-on-launch to
// heal. `fixtures/rtl-mirror.fig` is the intended file (spec §3.4); it runs meaningfully on any file
// with auto-layout frames, skipping the assertions whose structures are absent.
//
// Scaffolding only — never run by Vitest. Wired behind import.meta.env.DEV in main.ts.
import { restoreByOp, withSnapshot } from '../snapshot';
import { collectContainers } from '../traversal';
import { applyRtlMirror, readMirrorInput, revertRtlMirror } from './index';
import { isPositionedByParent, planMirror } from './mirror';

const note = (notes: string[], label: string, ok: boolean, detail = ''): void => {
	notes.push(`ls11:${label}:${ok ? 'PASS' : 'FAIL'}${detail ? ` ${detail}` : ''}`);
};
const skip = (notes: string[], label: string, why: string): void => {
	notes.push(`ls11:${label}:SKIP ${why}`);
};

export interface RtlCheckReport {
	notes: string[];
}

/** Everything a mirror can change on one node, as a comparable string. */
interface Probe {
	x: number;
	paddingLeft?: number;
	paddingRight?: number;
	primary?: string;
	counter?: string;
	itemReverseZIndex?: boolean;
	constraint?: string;
	childOrder?: string;
	textAlign?: string;
}

function probe(node: SceneNode): Probe {
	const out: Probe = { x: node.x };
	if ('layoutMode' in node) {
		out.paddingLeft = node.paddingLeft;
		out.paddingRight = node.paddingRight;
		out.primary = node.primaryAxisAlignItems;
		out.counter = node.counterAxisAlignItems;
		out.itemReverseZIndex = node.itemReverseZIndex;
	}
	if ('constraints' in node) out.constraint = node.constraints.horizontal;
	if ('children' in node) out.childOrder = node.children.map((child) => child.id).join(',');
	if (node.type === 'TEXT') out.textAlign = node.textAlignHorizontal;
	return out;
}

function probeDiff(a: Probe, b: Probe): string[] {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Probe>;
	const out: string[] = [];
	for (const key of keys) {
		if (a[key] !== b[key]) out.push(`${key}: ${String(b[key])} → ${String(a[key])}`);
	}
	return out;
}

export async function runRtlCheck(): Promise<RtlCheckReport> {
	const notes: string[] = [];
	await figma.currentPage.loadAsync();

	const containers = collectContainers('page');
	if (containers.length === 0) {
		skip(notes, 'fixture', 'no containers on this page');
		return { notes };
	}

	// Every node the mirror could touch — containers and their direct children, matching
	// applyRtlMirror's own target set.
	const targets = new Map<string, SceneNode>();
	for (const container of containers) {
		targets.set(container.id, container);
		if ('children' in container) for (const child of container.children) targets.set(child.id, child);
	}

	// Baseline BEFORE anything is touched. Every restore assertion compares against this.
	const baseline = new Map<string, Probe>();
	for (const [id, node] of targets) baseline.set(id, probe(node));

	try {
		// ── [1] apply ────────────────────────────────────────────────────────────────────────────
		const first = await applyRtlMirror('page');
		note(
			notes,
			'apply',
			first.succeeded.length > 0,
			`succeeded=${first.succeeded.length} blocked=${first.blocked.length} failed=${first.failed.length} flagged=${first.flagged.length}`,
		);

		// WHY it failed, not just that it did. The first version of this harness printed only counts
		// — the same mistake LS-10's first harness made, and the same one it fixed: a count says a
		// failure exists and nothing about its shape, which is the one thing needed to act on it.
		//
		// A rolled-back batch marks the culprit with the real message and everyone else with
		// "rolled back: …", so the distinct set is short even when the count is large. The plan for
		// the culprit is printed too: knowing WHICH write threw is most of the diagnosis.
		if (first.failed.length > 0) {
			const culprits = first.failed.filter((entry) => !entry.error.startsWith('rolled back:'));
			for (const entry of culprits.slice(0, 3)) {
				const node = targets.get(entry.nodeId);
				const plan = node === undefined ? [] : planMirror(readMirrorInput(node)).map((write) => write.kind);
				notes.push(
					`ls11:apply-error "${node?.name ?? entry.nodeId}" [${node?.type ?? '?'}] ` +
						`parent=${node?.parent?.type ?? '?'} writes=[${plan.join(',')}] :: ${entry.error}`,
				);
			}
			const rolled = first.failed.length - culprits.length;
			if (rolled > 0) notes.push(`ls11:apply-error ${rolled} further node(s) rolled back as a consequence`);
		}

		if (first.blocked.length > 0) {
			const byReason = new Map<string, number>();
			for (const entry of first.blocked) byReason.set(entry.reason, (byReason.get(entry.reason) ?? 0) + 1);
			notes.push(`ls11:blocked-why ${[...byReason].map(([reason, n]) => `${reason}=${n}`).join(' ')}`);
		}

		// ── [2] something actually changed ───────────────────────────────────────────────────────
		const changed = [...targets].filter(([id, node]) => {
			const before = baseline.get(id);
			return before !== undefined && probeDiff(probe(node), before).length > 0;
		});
		note(notes, 'mirror-visible', changed.length > 0, `${changed.length} node(s) differ from baseline`);

		// ── [3] mirror-twice is the identity ─────────────────────────────────────────────────────
		// The claim §2.3 makes: F1 and F7 act on disjoint sets, nothing resizes, and every rule is its
		// own inverse — so recursion order is free. Checked by re-planning from the MIRRORED state and
		// predicting where those writes would land: that prediction must equal the baseline. Comparing
		// a plan to itself would assert nothing, and applying a third mutation to find out would be
		// testing the applier rather than the rules.
		const involutionBreaks: string[] = [];
		for (const [id, node] of targets) {
			const before = baseline.get(id);
			if (before === undefined) continue;
			const back = planMirror(readMirrorInput(node));
			if (back.length === 0) continue;
			const predicted: Probe = { ...probe(node) };
			for (const write of back) {
				if (write.kind === 'padding') {
					predicted.paddingLeft = write.left;
					predicted.paddingRight = write.right;
				} else if (write.kind === 'primary-align') predicted.primary = write.value;
				else if (write.kind === 'counter-align') predicted.counter = write.value;
				else if (write.kind === 'constraint-horizontal') predicted.constraint = write.value;
				else if (write.kind === 'x') predicted.x = write.x;
				else if (write.kind === 'item-reverse-z') predicted.itemReverseZIndex = write.value;
				else if (write.kind === 'text-align') predicted.textAlign = write.value;
			}
			// Two fields are excluded, and neither is a free pass.
			//
			// `childOrder` — reversing twice is trivially the identity; predicting it would just
			// restate the baseline.
			//
			// `x` for a node its PARENT lays out — that position is DERIVED from the parent's child
			// order, and the rules deliberately never write it (LS-11 §2.3, which is exactly why F1
			// and F7 act on disjoint sets). Predicting "no write" against a baseline that moved when
			// the parent reversed compares a rule against something it does not control, so the
			// first version of this assertion reported a failure that was the harness's own.
			const derivedX = isPositionedByParent(readMirrorInput(node));
			const diff = probeDiff(predicted, before).filter(
				(line) => !line.startsWith('childOrder') && !(derivedX && line.startsWith('x:')),
			);
			if (diff.length > 0) involutionBreaks.push(`${node.name}: ${diff.join('; ')}`);
		}
		note(
			notes,
			'mirror-twice-identity',
			involutionBreaks.length === 0,
			involutionBreaks.length === 0
				? 'every re-plan predicts the baseline'
				: involutionBreaks.slice(0, 3).join(' | '),
		);

		// ── [4] blocked nodes were never touched ─────────────────────────────────────────────────
		const touched = first.blocked.filter((entry) => {
			const node = targets.get(entry.nodeId);
			const want = baseline.get(entry.nodeId);
			return node !== undefined && want !== undefined && probeDiff(probe(node), want).length > 0;
		});
		note(
			notes,
			'blocked-untouched',
			touched.length === 0,
			`${first.blocked.length} blocked, ${touched.length} touched`,
		);

		const instanceLocked = first.blocked.filter((b) => b.reason === 'instance-locked');
		if (instanceLocked.length === 0) skip(notes, 'instance-locked', 'no instance children on this page');
		else note(notes, 'instance-locked', true, `${instanceLocked.length} instance child(ren) skipped`);

		// ── [5] a second apply must NOT compound ─────────────────────────────────────────────────
		const second = await applyRtlMirror('page');
		const compounded = [...targets].filter(([id, node]) => {
			const afterFirst = changed.find(([changedId]) => changedId === id);
			if (afterFirst === undefined) return false;
			// Re-applying from source must land on the same place the first apply did.
			return probeDiff(probe(node), probe(afterFirst[1])).length > 0;
		});
		note(
			notes,
			'no-compounding',
			compounded.length === 0,
			compounded.length === 0
				? `${second.succeeded.length} node(s) re-applied from source`
				: `ORIGINAL LAYOUT AT RISK — ${compounded.length} node(s) drifted on re-apply`,
		);

		// ── [6] the already-mutated guard, exercised directly ────────────────────────────────────
		const live = [...targets.values()].find((node) => second.succeeded.includes(node.id));
		if (live === undefined) skip(notes, 'already-mutated-guard', 'no live mirrored node to test with');
		else {
			const before = probe(live);
			const guarded = await withSnapshot([live], 'rtl-mirror', (node) => {
				node.x += 1000;
				return Promise.resolve();
			});
			const blockedHere = guarded.blocked.find((b) => b.nodeId === live.id);
			note(
				notes,
				'already-mutated-guard',
				blockedHere?.reason === 'already-mutated' && probeDiff(probe(live), before).length === 0,
				blockedHere?.reason ?? 'not blocked',
			);
		}

		// ── [7] revert restores byte-identically ─────────────────────────────────────────────────
		const reverted = await revertRtlMirror();
		const dirty: string[] = [];
		for (const [id, node] of targets) {
			const want = baseline.get(id);
			if (want === undefined) continue;
			const diff = probeDiff(probe(node), want);
			if (diff.length > 0) dirty.push(`${node.name}: ${diff.join('; ')}`);
		}
		// WHICH dirty nodes the restore never even attempted. A node missing from `succeeded` was
		// dropped before any property was written — a different defect from one that was restored
		// badly, and the count alone cannot tell them apart. (`restoreIds` silently treated every
		// non-TEXT node as NODE_GONE; this is the line that would have said so.)
		const restored = new Set(reverted.succeeded);
		const neverTried = [...targets.keys()].filter(
			(id) =>
				!restored.has(id) &&
				probeDiff(probe(targets.get(id) as SceneNode), baseline.get(id) as Probe).length > 0,
		);
		note(
			notes,
			'revert-byte-identical',
			dirty.length === 0,
			dirty.length === 0
				? `${reverted.succeeded.length} restored`
				: `${reverted.succeeded.length} restored, ${neverTried.length} dirty node(s) never attempted :: ${dirty.slice(0, 3).join(' | ')}`,
		);

		// ── [8] revert is op-scoped and idempotent ───────────────────────────────────────────────
		const again = await restoreByOp('rtl-mirror');
		note(
			notes,
			'revert-idempotent',
			again.succeeded.length === 0 && again.failed.length === 0,
			`second revert restored ${again.succeeded.length}`,
		);

		// ── [9] one undo step per mutation ───────────────────────────────────────────────────────
		// Counting calls means replacing `figma.commitUndo`, and in this runtime that property is
		// READ-ONLY — the assignment throws. It is not worth failing the whole harness over, and
		// silently swallowing it would report a pass that never ran, so it degrades to a SKIP and the
		// MANUAL check below carries the guarantee.
		const realCommitUndo = figma.commitUndo.bind(figma);
		let patched = false;
		let commits = 0;
		try {
			figma.commitUndo = () => {
				commits += 1;
				realCommitUndo();
			};
			patched = true;
		} catch {
			skip(notes, 'one-undo-step', 'figma.commitUndo is read-only in this runtime — use the manual check');
		}
		if (patched) {
			try {
				await applyRtlMirror('page');
				const afterApply = commits;
				await revertRtlMirror();
				note(
					notes,
					'one-undo-step',
					afterApply === 1 && commits - afterApply === 1,
					`apply=${afterApply} revert=${commits - afterApply} (want 1 and 1)`,
				);
			} finally {
				figma.commitUndo = realCommitUndo;
			}
		}

		notes.push(
			'ls11:MANUAL — the above counts commitUndo calls, not Figma undo entries. Confirm once by hand: apply, then Cmd-Z ONCE, and the whole mirror should revert together.',
		);
	} catch (err) {
		note(notes, 'harness', false, err instanceof Error ? err.message : String(err));
		// Never leave the canvas mirrored because an assertion threw.
		try {
			await revertRtlMirror();
			notes.push('ls11:cleanup:PASS canvas restored after the failure');
		} catch (cleanupErr) {
			notes.push(
				`ls11:cleanup:FAIL ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)} — reopen the plugin; restore-on-launch will heal it`,
			);
		}
	}

	notes.push('ls11:done');
	return { notes };
}
