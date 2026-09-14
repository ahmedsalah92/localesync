// src/ui/rtl/state.test.ts — the reducer, pure (no React, no `./bridge`).
import { describe, expect, it } from 'vitest';
import type { BlockedNode, FlaggedNode } from '../../common/models';
import { initialRtlState, isBusy, isMirrorOn, missingFontCount, rtlReducer } from './state';
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
