// src/ui/shell/applied.test.ts — per-feature applied state (LS-34). Pure.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { BANNER_ORDER, bannerRows, withApplied, withBusy, type AppliedMap, type AppliedState } from './applied';

const empty: AppliedMap = { preview: null, pseudo: null, rtl: null };
const on = (message: string): AppliedState => ({ kind: 'applied', message, onRevert: () => {} });

describe('withApplied — one feature never touches another', () => {
	it('sets one feature and leaves the others unchanged', () => {
		const pseudo = on('Pseudo-loc applied');
		const next = withApplied({ ...empty, pseudo }, 'preview', on('Preview: German (de)'));
		expect(next.pseudo).toBe(pseudo);
		expect(next.rtl).toBeNull();
		expect(next.preview?.message).toBe('Preview: German (de)');
	});

	it('clears one feature and leaves the others set, without mutating its input', () => {
		const before: AppliedMap = { ...empty, preview: on('p'), pseudo: on('q') };
		const next = withApplied(before, 'pseudo', null);
		expect(next.preview?.message).toBe('p');
		expect(next.pseudo).toBeNull();
		expect(before.pseudo?.message).toBe('q');
	});
});

describe('bannerRows — tab order, not apply order', () => {
	it('is empty when nothing is applied', () => {
		expect(bannerRows(empty)).toEqual([]);
	});

	it('orders rows by BANNER_ORDER regardless of which was set first', () => {
		const later = withApplied(withApplied(empty, 'pseudo', on('q')), 'preview', on('p'));
		expect(bannerRows(later).map((r) => r.feature)).toEqual(['preview', 'pseudo']);
		expect(BANNER_ORDER).toEqual(['preview', 'pseudo', 'rtl']);
	});

	it('returns three rows when all three are applied', () => {
		const all: AppliedMap = { preview: on('p'), pseudo: on('q'), rtl: on('r') };
		expect(bannerRows(all)).toHaveLength(3);
	});
});

describe('restored cannot carry a Revert (LS-5 rule, unchanged)', () => {
	it('is a compile-time fact', () => {
		expectTypeOf<Extract<AppliedState, { kind: 'restored' }>>().not.toHaveProperty('onRevert');
		expectTypeOf<Extract<AppliedState, { kind: 'applied' }>>().toHaveProperty('onRevert');
	});
});

describe('withBusy (LS-34)', () => {
	it('marks an applied row busy and back', () => {
		const onRevert = () => {};
		const row: AppliedState = { kind: 'applied', message: 'Preview: German (de)', onRevert };
		expect(withBusy(row, true)).toMatchObject({ kind: 'applied', busy: true, onRevert });
		expect(withBusy(withBusy(row, true), false)).toMatchObject({ kind: 'applied', busy: false });
	});

	it('never creates a row, and leaves a restored one alone', () => {
		expect(withBusy(null, true)).toBeNull();
		const restored: AppliedState = { kind: 'restored', message: 'Restored your canvas.' };
		expect(withBusy(restored, true)).toBe(restored);
	});
});
