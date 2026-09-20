// src/ui/rtl/state.test.ts — the reducer, pure (no React, no `./bridge`).
import { describe, expect, it } from 'vitest';
import type { BlockedNode, FlaggedNode } from '../../common/models';
import {
	initialRtlState,
	isBusy,
	isMirrorOn,
	missingFontCount,
	progressAction,
	rtlReducer,
	selectShell,
} from './state';
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
			{ kind: 'applied', blocked: [] },
		]);
		expect(state.phase).toBe('applied');
		expect(state.flagged).toHaveLength(1);
	});

	it('reaches applied with no review list when nothing was flagged', () => {
		const state = run([{ kind: 'apply-started' }, { kind: 'applied', blocked: [] }]);
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
			{ kind: 'applied', blocked: [blocked('missing-font')] },
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

describe('missingFontCount', () => {
	it('counts only the missing-font blocks', () => {
		expect(missingFontCount([blocked('missing-font'), blocked('instance-locked'), blocked('missing-font')])).toBe(
			2,
		);
	});
});

describe('selectShell — what the panel body shows', () => {
	const applied = (flagged = 0, blocked: BlockedNode[] = []): RtlState =>
		run([
			{ kind: 'apply-started' },
			...(flagged > 0
				? [{ kind: 'flagged' as const, flagged: Array.from({ length: flagged }, (_, i) => flag(String(i))) }]
				: []),
			{ kind: 'applied', blocked },
		]);

	/**
	 * The regression this function exists for. A mirror that succeeded and flagged nothing used to
	 * fall through to the first-run copy — telling the user "Nothing to mirror yet" directly under a
	 * banner reading "RTL mirror applied". Two contradictory claims about the same canvas.
	 */
	it('does NOT show first-run after a successful mirror', () => {
		expect(selectShell(applied(), 0)).toBe('no-issues');
		expect(selectShell(applied(), 0)).not.toBe('first-run');
	});

	it('shows first-run only before anything is applied', () => {
		expect(selectShell(initialRtlState(), 0)).toBe('first-run');
		expect(selectShell(run([{ kind: 'revert-started' }, { kind: 'reverted' }], applied()), 0)).toBe('first-run');
	});

	// The rows ARE the content when there is something to review.
	it('renders the review list rather than any empty state', () => {
		expect(selectShell(applied(2), 0)).toBeNull();
		expect(selectShell(applied(2), 3)).toBeNull();
	});

	it('reports skipped layers when a mirror applied but some were blocked', () => {
		expect(selectShell(applied(0, [blocked('missing-font')]), 1)).toBe('fonts-unavailable');
	});

	// A failure outranks everything: the canvas was restored, so there is nothing to review.
	it('shows the failure state even with a stale review list', () => {
		expect(selectShell(run([{ kind: 'failed', code: 'mutation-failed' }], applied(2)), 0)).toBe('operation-failed');
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
		expect(progressAction('apply', [])).toEqual({ kind: 'applied', blocked: [] });
	});

	it('completes a revert', () => {
		expect(progressAction('revert', [])).toEqual({ kind: 'reverted' });
	});

	// A progress correlated to nothing we started must not move the panel at all.
	it('ignores a progress we were not waiting on', () => {
		expect(progressAction(null, [])).toBeNull();
	});

	// `nodes-blocked` arrives BEFORE the terminal progress, so the blocked list is carried in.
	it('carries the blocked list collected before the terminal progress', () => {
		const list = [blocked('missing-font')];
		expect(progressAction('apply', list)).toEqual({ kind: 'applied', blocked: list });
	});

	// The reducer's own guarantee, which the stale closure violated end to end: an apply that
	// completes must leave the switch ON.
	it('an applied run leaves the mirror on, a reverted one leaves it off', () => {
		const afterApply = run([{ kind: 'apply-started' }, progressAction('apply', []) as RtlAction]);
		expect(isMirrorOn(afterApply.phase)).toBe(true);
		const afterRevert = run([{ kind: 'revert-started' }, progressAction('revert', []) as RtlAction], afterApply);
		expect(isMirrorOn(afterRevert.phase)).toBe(false);
	});
});
