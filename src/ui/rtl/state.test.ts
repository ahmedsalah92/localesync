// src/ui/rtl/state.test.ts — the reducer, pure (no React, no `./bridge`).
import { describe, expect, it } from 'vitest';
import type { BlockedNode, FlaggedNode } from '../../common/models';
import { initialRtlState, isBusy, isMirrorOn, progressAction, rtlReducer, selectShell, summarize } from './state';
import type { RtlAction, RtlState } from './state';

const run = (actions: RtlAction[], from: RtlState = initialRtlState()): RtlState => actions.reduce(rtlReducer, from);

const flag = (nodeId: string): FlaggedNode => ({ nodeId, name: `icon ${nodeId}`, reason: 'moved-vector' });
const blocked = (reason: BlockedNode['reason']): BlockedNode => ({ nodeId: 'b', reason });

describe('the apply → flagged → applied sequence', () => {
	/**
	 * `rtl-flagged` arrives BEFORE the terminal progress, so it lands while still `applying`. It must
	 * not advance the phase itself, or a run with a review list and a run without one would reach
	 * `applied` by different paths.
	 */
	it('records the review list without leaving `applying`', () => {
		const state = run([{ kind: 'apply-started' }, { kind: 'flagged', flagged: [flag('1'), flag('2')] }]);
		expect(state.phase).toBe('applying');
		expect(state.flagged).toHaveLength(2);
	});

	it('reaches applied and keeps the review list', () => {
		const state = run([
			{ kind: 'apply-started' },
			{ kind: 'flagged', flagged: [flag('1')] },
			{ kind: 'applied', blocked: [], mirrored: 1 },
		]);
		expect(state.phase).toBe('applied');
		expect(state.flagged).toHaveLength(1);
	});

	it('reaches applied with no review list when nothing was flagged', () => {
		const state = run([{ kind: 'apply-started' }, { kind: 'applied', blocked: [], mirrored: 1 }]);
		expect(state.phase).toBe('applied');
		expect(state.flagged).toEqual([]);
	});

	// A re-apply must not show the previous run's findings while the new one is in flight.
	it('clears the previous review list when a new run starts', () => {
		const applied = run([{ kind: 'apply-started' }, { kind: 'flagged', flagged: [flag('1')] }]);
		expect(run([{ kind: 'apply-started' }], applied).flagged).toEqual([]);
	});
});

describe('revert returns to the first-run surface', () => {
	it('drops rows, blocks and selection', () => {
		const applied = run([
			{ kind: 'apply-started' },
			{ kind: 'flagged', flagged: [flag('1')] },
			{ kind: 'applied', blocked: [blocked('missing-font')], mirrored: 1 },
			{ kind: 'select', nodeId: '1' },
		]);
		const reverted = run([{ kind: 'revert-started' }, { kind: 'reverted' }], applied);
		expect(reverted).toMatchObject({ phase: 'idle', flagged: [], blocked: [], selectedNodeId: null });
	});
});

describe('isMirrorOn — the Switch never lies about the canvas', () => {
	// On during `applying` too: otherwise the toggle flicks back to off mid-run and reads as though
	// the mirror is not applied while it is being applied.
	it.each([
		['applying', true],
		['applied', true],
		['reverting', false],
		['idle', false],
		['failed', false],
	] as const)('%s → %s', (phase, expected) => {
		expect(isMirrorOn(phase)).toBe(expected);
	});
});

describe('isBusy — the toggle is disabled mid-mutation', () => {
	it.each([
		['applying', true],
		['reverting', true],
		['idle', false],
		['applied', false],
		['failed', false],
	] as const)('%s → %s', (phase, expected) => {
		expect(isBusy(phase)).toBe(expected);
	});
});

describe('failure', () => {
	it('clears the review list, because the canvas was restored', () => {
		const state = run([
			{ kind: 'apply-started' },
			{ kind: 'flagged', flagged: [flag('1')] },
			{ kind: 'failed', code: 'mutation-failed' },
		]);
		expect(state).toMatchObject({ phase: 'failed', errorCode: 'mutation-failed', flagged: [] });
	});
});

describe('selectShell — what the panel body shows (LS-28 §2.4)', () => {
	const applied = (flagged = 0, blocked: BlockedNode[] = []): RtlState =>
		run([
			{ kind: 'apply-started' },
			...(flagged > 0
				? [{ kind: 'flagged' as const, flagged: Array.from({ length: flagged }, (_, i) => flag(String(i))) }]
				: []),
			{ kind: 'applied', blocked, mirrored: 1 },
		]);

	/**
	 * The regression the old `no-issues` shell existed for — "Nothing to mirror yet" under a banner
	 * reading "RTL mirror applied" — cannot happen now: an applied mirror always shows the summary.
	 */
	it('shows the summary for every applied mirror, clean, flagged or blocked', () => {
		expect(selectShell(applied())).toBeNull();
		expect(selectShell(applied(2))).toBeNull();
		expect(selectShell(applied(0, [blocked('missing-font')]))).toBeNull();
	});

	it('shows first-run only before anything is applied', () => {
		expect(selectShell(initialRtlState())).toBe('first-run');
		expect(selectShell(run([{ kind: 'revert-started' }, { kind: 'reverted' }], applied()))).toBe('first-run');
	});

	// A failure outranks everything: the canvas was restored, so there is nothing to summarise.
	it('shows the failure state even with a stale review list', () => {
		expect(selectShell(run([{ kind: 'failed', code: 'mutation-failed' }], applied(2)))).toBe('operation-failed');
	});
});

/**
 * The bug that made the switch snap back off while the canvas mirrored.
 *
 * The panel decided what an arriving `progress` meant by reading `phase === 'applying'` INSIDE its
 * message listener. That listener is a closure built on the render before the toggle was clicked,
 * so it still saw `idle` — and an apply's completion was handled as a revert.
 *
 * The harness never caught it because it calls the main-thread functions directly; the panel was
 * the only thing broken, and nothing exercised the round-trip through it.
 */
describe('progressAction — what a terminal progress means (regression)', () => {
	it('completes an apply, never a revert', () => {
		expect(progressAction('apply', [], 12)).toEqual({ kind: 'applied', blocked: [], mirrored: 12 });
	});

	it('completes a revert', () => {
		expect(progressAction('revert', [], 12)).toEqual({ kind: 'reverted' });
	});

	// A progress correlated to nothing we started must not move the panel at all.
	it('ignores a progress we were not waiting on', () => {
		expect(progressAction(null, [], 0)).toBeNull();
	});

	// `nodes-blocked` arrives BEFORE the terminal progress, so the blocked list is carried in.
	it('carries the blocked list collected before the terminal progress', () => {
		const list = [blocked('missing-font')];
		expect(progressAction('apply', list, 3)).toEqual({ kind: 'applied', blocked: list, mirrored: 3 });
	});

	// The reducer's own guarantee, which the stale closure violated end to end: an apply that
	// completes must leave the switch ON.
	it('an applied run leaves the mirror on, a reverted one leaves it off', () => {
		const afterApply = run([{ kind: 'apply-started' }, progressAction('apply', [], 1) as RtlAction]);
		expect(isMirrorOn(afterApply.phase)).toBe(true);
		const afterRevert = run([{ kind: 'revert-started' }, progressAction('revert', [], 1) as RtlAction], afterApply);
		expect(isMirrorOn(afterRevert.phase)).toBe(false);
	});
});

describe('selectShell distinguishes "nothing to mirror" from "the mirror failed"', () => {
	// The panel showed "Couldn't complete — The mirror failed and your canvas was restored" when
	// the real outcome was that nothing in scope was mirrorable. Alarming and untrue: nothing was
	// attempted, so nothing was restored.
	it('shows the empty state for no-text-nodes, not the failure state', () => {
		const state = run([{ kind: 'apply-started' }, { kind: 'failed', code: 'no-text-nodes' }]);
		expect(selectShell(state)).toBe('no-text-on-page');
	});

	it('still shows the failure state for a genuine failure', () => {
		const state = run([{ kind: 'apply-started' }, { kind: 'failed', code: 'mutation-failed' }]);
		expect(selectShell(state)).toBe('operation-failed');
		expect(selectShell(run([{ kind: 'failed', code: 'internal' }]))).toBe('operation-failed');
	});
});

/**
 * Scope is explicit, and the ruleset's earlier "implicit scope" rule rested on a false claim about
 * the built design — which has a scope select at `538:1437`. Corrected 2026-09-20.
 *
 * It matters on the merits, not just for fidelity: a mirror restructures layout, so a user who
 * cannot see what is about to be restructured has no way to scope the blast radius.
 */
describe('scope', () => {
	it('defaults to Page, matching the built design', () => {
		expect(initialRtlState().scope).toBe('page');
	});

	it('is remembered across a run', () => {
		const chosen = run([{ kind: 'set-scope', scope: 'selection' }]);
		expect(run([{ kind: 'apply-started' }, { kind: 'applied', blocked: [], mirrored: 1 }], chosen).scope).toBe(
			'selection',
		);
	});

	// Changing scope must not re-apply: this mutates the user's file, so the switch is the commit.
	it('does not move the phase', () => {
		const applied = run([{ kind: 'apply-started' }, { kind: 'applied', blocked: [], mirrored: 1 }]);
		expect(run([{ kind: 'set-scope', scope: 'selection' }], applied).phase).toBe('applied');
	});

	it('survives a revert, so the next run reuses the choice', () => {
		const state = run([
			{ kind: 'set-scope', scope: 'selection' },
			{ kind: 'apply-started' },
			{ kind: 'applied', blocked: [], mirrored: 1 },
			{ kind: 'revert-started' },
			{ kind: 'reverted' },
		]);
		expect(state).toMatchObject({ phase: 'idle', scope: 'selection' });
	});
});

// ── LS-28: the change summary ─────────────────────────────────────────────────────────────────

const node = (nodeId: string, reason: BlockedNode['reason']): BlockedNode => ({ nodeId, reason, name: nodeId });

/** The spec's fixed state (LS-28 §3.1): 12 mirrored, 3 flagged, instance ×2, font ×1, empty ×1. */
const fixture = (): RtlState =>
	run([
		{ kind: 'apply-started' },
		{ kind: 'flagged', flagged: [flag('1'), flag('2'), flag('3')] },
		{
			kind: 'applied',
			mirrored: 12,
			blocked: [
				node('e', 'empty'),
				node('i1', 'instance-locked'),
				node('f', 'missing-font'),
				node('i2', 'instance-locked'),
			],
		},
	]);

describe('summarize — groups, order, omission (LS-28 §2.1)', () => {
	it('returns every non-empty group in the fixed order', () => {
		const groups = summarize(fixture());
		expect(
			groups.map((g) => (g.kind === 'mirrored' ? `mirrored:${g.count}` : `${g.key}:${g.nodes.length}`)),
		).toEqual(['mirrored:12', 'moved:3', 'skipped:instance-locked:2', 'skipped:missing-font:1', 'skipped:empty:1']);
	});

	it('keeps the main thread’s node order inside a group', () => {
		const instance = summarize(fixture()).find((g) => g.kind === 'skipped' && g.reason === 'instance-locked');
		expect(instance?.kind === 'skipped' && instance.nodes.map((n) => n.nodeId)).toEqual(['i1', 'i2']);
	});

	// Replaces the old `no-issues` shell: a clean mirror still says what it did.
	it('a clean mirror is just the mirrored row', () => {
		const clean = run([{ kind: 'apply-started' }, { kind: 'applied', blocked: [], mirrored: 12 }]);
		expect(summarize(clean)).toEqual([{ kind: 'mirrored', count: 12 }]);
	});

	// Replaces the old `fonts-unavailable` shell.
	it('a fonts-only run is the mirrored row plus one skipped group', () => {
		const fonts = run([
			{ kind: 'apply-started' },
			{ kind: 'applied', blocked: [node('f', 'missing-font')], mirrored: 5 },
		]);
		expect(summarize(fonts).map((g) => g.kind)).toEqual(['mirrored', 'skipped']);
	});

	it('shows the mirrored row first even when nothing was mirrored', () => {
		const allSkipped = run([
			{ kind: 'apply-started' },
			{ kind: 'applied', blocked: [node('a', 'empty'), node('b', 'empty')], mirrored: 0 },
		]);
		expect(summarize(allSkipped)[0]).toEqual({ kind: 'mirrored', count: 0 });
	});

	it.each(['idle', 'applying', 'reverting', 'failed'] as const)('is empty while %s', (phase) => {
		expect(summarize({ ...fixture(), phase })).toEqual([]);
	});

	// Review Focus 2: never blocked for rtl-mirror, but the type allows it — drop it quietly.
	it('ignores a mixed-font block rather than rendering or crashing', () => {
		const odd = run([
			{ kind: 'apply-started' },
			{ kind: 'applied', blocked: [node('m', 'mixed-font-char-mutation')], mirrored: 1 },
		]);
		expect(summarize(odd)).toEqual([{ kind: 'mirrored', count: 1 }]);
	});
});

describe('expansion (LS-28 §2.3)', () => {
	it('opens the moved group by default', () => {
		expect(initialRtlState().expanded).toEqual(['moved']);
	});

	it('toggle-group opens and closes a group', () => {
		const opened = run([{ kind: 'toggle-group', key: 'skipped:empty' }], fixture());
		expect(opened.expanded).toEqual(['moved', 'skipped:empty']);
		expect(run([{ kind: 'toggle-group', key: 'skipped:empty' }], opened).expanded).toEqual(['moved']);
	});

	it('resets to the default on every apply', () => {
		const fiddled = run(
			[
				{ kind: 'toggle-group', key: 'moved' },
				{ kind: 'toggle-group', key: 'skipped:empty' },
			],
			fixture(),
		);
		expect(run([{ kind: 'apply-started' }], fiddled).expanded).toEqual(['moved']);
	});
});

// Review Focus 3: a re-apply must not show the previous run's count.
describe('mirrored count across runs', () => {
	it('is cleared when a new run starts and when the mirror is reverted', () => {
		expect(run([{ kind: 'apply-started' }], fixture()).mirrored).toBe(0);
		expect(run([{ kind: 'revert-started' }, { kind: 'reverted' }], fixture())).toMatchObject({
			mirrored: 0,
			expanded: ['moved'],
		});
	});
});
