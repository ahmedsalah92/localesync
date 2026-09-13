// src/main/pseudoloc/check.ts  (main thread; dev-only scaffold for "Run LS-10 pseudo-loc check")
//
// LS-10 integration harness (spec §3.3). Canvas mutation and byte-identical restore are not things
// Vitest can prove — a faked `figma` cannot carry them (agent-guidelines §6) — so every assertion
// here needs the real runtime.
//
// Unlike the LS-4 and LS-9 harnesses this does NOT piggyback on a feature message: it is driven by
// a `__dev:pseudoloc-check` sentinel, because it must apply and revert on its own schedule rather
// than alongside a real handler answering the same request. Notes go to the main-thread console,
// which Figma surfaces directly; there is nothing for the UI to assert here.
//
// **It mutates the canvas and restores it.** Every path ends in a revert, including the failure
// paths, and anything it cannot restore is left in the durable manifest for restore-on-launch to
// heal. Safe on any file with text; `fixtures/kitchen-sink.fig` is the intended one because it
// carries the missing-font, mixed-font, empty and in-instance rows that exercise the block table.
//
// Scaffolding only — never run by Vitest. Wired behind import.meta.env.DEV in main.ts.
import { transform } from '../../common/pseudoloc';
import type { PseudoLocOptions } from '../../common/models';
import { probe, probeDiff, type Probe } from '../snapshot/check';
import { restoreByOp, withSnapshot } from '../snapshot';
import { applyPseudoLoc, revertPseudoLoc } from './index';

const OPTS_40: PseudoLocOptions = { expansionPct: 40, accent: 'full', markers: 'double' };
const OPTS_50: PseudoLocOptions = { expansionPct: 50, accent: 'partial', markers: 'single' };

const note = (notes: string[], label: string, ok: boolean, detail = ''): void => {
	notes.push(`ls10:${label}:${ok ? 'PASS' : 'FAIL'}${detail ? ` ${detail}` : ''}`);
};
const skip = (notes: string[], label: string, why: string): void => {
	notes.push(`ls10:${label}:SKIP ${why}`);
};

export interface PseudoLocCheckReport {
	notes: string[];
}

export async function runPseudoLocCheck(): Promise<PseudoLocCheckReport> {
	const notes: string[] = [];
	await figma.currentPage.loadAsync();

	const nodes = figma.currentPage.findAllWithCriteria({ types: ['TEXT'] });
	if (nodes.length === 0) {
		skip(notes, 'fixture', 'no text nodes on this page');
		return { notes };
	}

	// Baseline BEFORE anything is touched. Every restore assertion compares against this, not
	// against an intermediate state.
	const baseline = new Map<string, Probe>();
	for (const node of nodes) baseline.set(node.id, probe(node));
	const originals = new Map<string, string>();
	for (const node of nodes) originals.set(node.id, node.characters);

	try {
		// ── [1] apply ────────────────────────────────────────────────────────────────────────────
		const first = await applyPseudoLoc('page', OPTS_40);
		note(
			notes,
			'apply',
			first.succeeded.length > 0,
			`succeeded=${first.succeeded.length} blocked=${first.blocked.length} failed=${first.failed.length}`,
		);
		note(notes, 'apply-multi-node', first.succeeded.length > 1, `${first.succeeded.length} nodes in one batch`);

		// Every succeeded node holds exactly transform(original) — not something merely different.
		const wrong = first.succeeded.filter((id) => {
			const node = nodes.find((n) => n.id === id);
			return node === undefined || node.characters !== transform(originals.get(id) ?? '', OPTS_40);
		});
		note(notes, 'apply-exact', wrong.length === 0, wrong.length === 0 ? '' : `${wrong.length} node(s) differ`);

		// ── [2] blocked nodes were never touched ─────────────────────────────────────────────────
		const touched = first.blocked.filter((entry) => {
			const node = nodes.find((n) => n.id === entry.nodeId);
			const want = baseline.get(entry.nodeId);
			return node !== undefined && want !== undefined && probeDiff(probe(node), want).length > 0;
		});
		note(notes, 'blocked-untouched', touched.length === 0, `${first.blocked.length} blocked, ${touched.length} touched`);

		const missingFont = first.blocked.filter((b) => b.reason === 'missing-font');
		if (missingFont.length === 0) skip(notes, 'missing-font-flagged', 'no missing-font row on this page');
		else note(notes, 'missing-font-flagged', true, `${missingFont.length} skipped and flagged`);

		// ── [3] a second apply must NOT compound ─────────────────────────────────────────────────
		// The one that would silently destroy user text if the restore-first ordering (§2.7) or the
		// already-mutated guard (§1.2) were wrong: the result must be 50% of the ORIGINAL, never 50%
		// of the already-padded 140%.
		const second = await applyPseudoLoc('page', OPTS_50);
		const compounded = second.succeeded.filter((id) => {
			const node = nodes.find((n) => n.id === id);
			return node === undefined || node.characters !== transform(originals.get(id) ?? '', OPTS_50);
		});
		note(
			notes,
			'no-compounding',
			compounded.length === 0,
			compounded.length === 0
				? `${second.succeeded.length} node(s) re-applied from source`
				: `${compounded.length} node(s) compounded — ORIGINAL TEXT AT RISK`,
		);

		// ── [4] the already-mutated guard, exercised directly ────────────────────────────────────
		// applyPseudoLoc restores first, so the guard never fires through the normal path. Calling
		// withSnapshot straight is the only way to prove it is armed.
		const live = nodes.find((n) => second.succeeded.includes(n.id));
		if (live === undefined) skip(notes, 'already-mutated-guard', 'no live mutated node to test with');
		else {
			const before = probe(live);
			const guarded = await withSnapshot([live], 'pseudoloc', (node) => {
				node.characters = `${node.characters}-SHOULD-NEVER-APPLY`;
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

		// ── [5] revert restores byte-identically ─────────────────────────────────────────────────
		const reverted = await revertPseudoLoc();
		const dirty: string[] = [];
		for (const node of nodes) {
			const want = baseline.get(node.id);
			if (want === undefined) continue;
			const diff = probeDiff(probe(node), want);
			if (diff.length > 0) dirty.push(`${node.name}: ${diff.join('; ')}`);
		}
		note(
			notes,
			'revert-byte-identical',
			dirty.length === 0,
			dirty.length === 0 ? `${reverted.succeeded.length} restored` : dirty.slice(0, 3).join(' | '),
		);

		// ── [6] revert is op-scoped and idempotent ───────────────────────────────────────────────
		const again = await restoreByOp('pseudoloc');
		note(
			notes,
			'revert-idempotent',
			again.succeeded.length === 0 && again.failed.length === 0,
			`second revert restored ${again.succeeded.length}`,
		);

		notes.push(
			'ls10:MANUAL — press Cmd-Z ONCE after a single Apply: the whole batch should revert as one undo step (§2.9).',
		);
	} catch (err) {
		note(notes, 'harness', false, err instanceof Error ? err.message : String(err));
		// Never leave the canvas mutated because an assertion threw.
		try {
			await revertPseudoLoc();
			notes.push('ls10:cleanup:PASS canvas restored after the failure');
		} catch (cleanupErr) {
			notes.push(
				`ls10:cleanup:FAIL ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)} — reopen the plugin; restore-on-launch will heal it`,
			);
		}
	}

	notes.push('ls10:done');
	return { notes };
}
