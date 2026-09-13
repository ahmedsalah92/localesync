// src/ui/pseudo/state.test.ts — pure unit tests (no `figma`, no DOM).
import { describe, expect, it } from 'vitest';
import type { BlockedNode, ExtractedString } from '../../common/models';
import {
	DEFAULT_OPTIONS,
	initialPseudoState,
	isBusy,
	missingFontCount,
	pseudoReducer,
	type PseudoState,
} from './state';

const entry = (key: string, value: string): ExtractedString => ({ key, nodeId: key, value, drifted: false });
const ENTRIES = [entry('home.title', 'Welcome back'), entry('cart.save', 'Save')];
const BLOCKED: BlockedNode[] = [
	{ nodeId: '1:1', reason: 'missing-font' },
	{ nodeId: '1:2', reason: 'empty' },
];

const reduce = (state: PseudoState, ...actions: Parameters<typeof pseudoReducer>[1][]): PseudoState =>
	actions.reduce(pseudoReducer, state);

describe('initialPseudoState', () => {
	it('starts idle on the canvas defaults: +40%, full accents, double markers', () => {
		const state = initialPseudoState();
		expect(state.phase).toBe('idle');
		expect(state.options).toEqual(DEFAULT_OPTIONS);
		expect(state.appliedWith).toBeNull();
	});

	it('is a factory, so two mounts do not share arrays', () => {
		expect(initialPseudoState().entries).not.toBe(initialPseudoState().entries);
	});
});

describe('pseudoReducer', () => {
	it('changing an option does NOT re-apply or touch what the canvas holds', () => {
		// §2.6: apply is explicit. The banner must keep naming the ratio actually on canvas, so
		// `appliedWith` cannot follow the selects.
		const applied = reduce(initialPseudoState(), { kind: 'apply-started' }, {
			kind: 'applied',
			entries: ENTRIES,
			blocked: [],
		});
		const changed = pseudoReducer(applied, { kind: 'set-options', options: { expansionPct: 50 } });

		expect(changed.options.expansionPct).toBe(50);
		expect(changed.appliedWith?.expansionPct).toBe(40);
		expect(changed.phase).toBe('applied');
	});

	it('snapshots the options into appliedWith when the apply lands', () => {
		const state = reduce(
			initialPseudoState(),
			{ kind: 'set-options', options: { expansionPct: 30, accent: 'none' } },
			{ kind: 'apply-started' },
			{ kind: 'applied', entries: ENTRIES, blocked: [] },
		);
		expect(state.appliedWith).toEqual({ expansionPct: 30, accent: 'none', markers: 'double' });
	});

	it('clears the previous run when a new apply starts', () => {
		const state = reduce(
			initialPseudoState(),
			{ kind: 'apply-started' },
			{ kind: 'applied', entries: ENTRIES, blocked: BLOCKED },
			{ kind: 'apply-started' },
		);
		expect(state.phase).toBe('applying');
		expect(state.blocked).toEqual([]);
		expect(state.errorCode).toBeNull();
	});

	it('returns to the first-run surface on revert — with the canvas restored there is nothing to list', () => {
		const state = reduce(
			initialPseudoState(),
			{ kind: 'apply-started' },
			{ kind: 'applied', entries: ENTRIES, blocked: BLOCKED },
			{ kind: 'select', nodeId: 'home.title' },
			{ kind: 'revert-started' },
			{ kind: 'reverted' },
		);
		expect(state.phase).toBe('idle');
		expect(state.entries).toEqual([]);
		expect(state.appliedWith).toBeNull();
		expect(state.selectedNodeId).toBeNull();
	});

	it('drops appliedWith on failure, so no banner can outlive a rolled-back batch', () => {
		const state = reduce(
			initialPseudoState(),
			{ kind: 'apply-started' },
			{ kind: 'applied', entries: ENTRIES, blocked: [] },
			{ kind: 'failed', code: 'mutation-failed' },
		);
		expect(state.appliedWith).toBeNull();
		expect(state.errorCode).toBe('mutation-failed');
	});

	it('copies the arrays it is handed rather than aliasing them', () => {
		const entries = [...ENTRIES];
		const state = pseudoReducer(initialPseudoState(), { kind: 'applied', entries, blocked: [] });
		entries.push(entry('extra.key', 'Extra'));
		expect(state.entries).toHaveLength(2);
	});
});

describe('isBusy', () => {
	it('covers both in-flight phases and nothing else', () => {
		expect(isBusy('applying')).toBe(true);
		expect(isBusy('reverting')).toBe(true);
		for (const phase of ['idle', 'applied', 'failed'] as const) expect(isBusy(phase)).toBe(false);
	});
});

describe('missingFontCount', () => {
	it('counts only the missing-font blocks, not every skipped node', () => {
		expect(missingFontCount(BLOCKED)).toBe(1);
		expect(missingFontCount([])).toBe(0);
	});
});
