// src/main/preview/rows.test.ts — pure unit tests (no `figma`).
import { describe, expect, it } from 'vitest';
import { ownersOf, planPreview, unmatchedKeys, withoutBlocked, partitionOwners } from './rows';

const stamp = (k: string, n: string) => ({ k, n, s: 'dot' as const, t: 1 });

describe('ownersOf — rule 9 ownership', () => {
	it('keeps only nodes whose stamp names themselves, in document order', () => {
		const owners = ownersOf([
			{ id: '1', characters: 'Welcome', stored: stamp('home.title', '1') },
			{ id: '2', characters: 'Welcome', stored: stamp('home.title', '1') }, // a copy: not an owner
			{ id: '3', characters: 'Plain', stored: null }, // never extracted
			{ id: '4', characters: 'Bye', stored: stamp('home.bye', '4') },
		]);
		expect(owners).toEqual([
			{ nodeId: '1', key: 'home.title', source: 'Welcome' },
			{ nodeId: '4', key: 'home.bye', source: 'Bye' },
		]);
	});
});

const owners = [
	{ nodeId: '1', key: 'a', source: 'A' },
	{ nodeId: '2', key: 'b', source: 'B' },
];

describe('planPreview', () => {
	it('targets translated owners and falls back the rest, in document order', () => {
		expect(planPreview(owners, { a: 'Ä', stray: 'x' })).toEqual({
			targets: [{ nodeId: '1', value: 'Ä' }],
			rows: [
				{ nodeId: '1', key: 'a', source: 'A', value: 'Ä' },
				{ nodeId: '2', key: 'b', source: 'B', value: null },
			],
		});
	});
});

describe('unmatchedKeys', () => {
	it('lists stored keys no owner holds, sorted', () => {
		expect(unmatchedKeys(owners, { z: '1', a: '2', m: '3' })).toEqual(['m', 'z']);
	});
});

// Review Focus 1: a blocked node is never a row, so it can never be edited.
describe('withoutBlocked', () => {
	it('drops rows whose node was blocked', () => {
		const rows = planPreview(owners, { a: 'Ä', b: 'Ɓ' }).rows;
		expect(withoutBlocked(rows, [{ nodeId: '2', reason: 'missing-font', name: 'b' }]).map((r) => r.nodeId)).toEqual(
			['1'],
		);
	});
});

// Final-review fix: a lookup like `translations[owner.key]` resolves an inherited member (e.g.
// `constructor`, `toString`) off Object.prototype, which is never a real translation.
describe('planPreview — own-property lookup (final review fix)', () => {
	it('falls back a key that names an inherited Object.prototype member, instead of treating it as a target', () => {
		const protoKeyedOwners = [{ nodeId: '1', key: 'constructor', source: 'Source' }];
		expect(planPreview(protoKeyedOwners, {})).toEqual({
			targets: [],
			rows: [{ nodeId: '1', key: 'constructor', source: 'Source', value: null }],
		});
	});

	it('still targets an own property named after an inherited member', () => {
		const protoKeyedOwners = [{ nodeId: '1', key: 'toString', source: 'Source' }];
		expect(planPreview(protoKeyedOwners, { toString: 'Wert' })).toEqual({
			targets: [{ nodeId: '1', value: 'Wert' }],
			rows: [{ nodeId: '1', key: 'toString', source: 'Source', value: 'Wert' }],
		});
	});
});

// LS-34: a key-owning layer that still carries ANOTHER feature's snapshot after Preview's own
// restore is reported as skipped (already-mutated), never as a row — its text is that feature's,
// not the source.
describe('partitionOwners', () => {
	const all = [
		{ nodeId: '1', key: 'a', source: 'A' },
		{ nodeId: '2', key: 'b', source: 'B~pseudo~' },
		{ nodeId: '3', key: 'c', source: 'C' },
	];

	it('splits off owners whose layer another feature has changed, keeping document order', () => {
		const { mine, foreign } = partitionOwners(all, new Set(['2']));
		expect(mine.map((o) => o.nodeId)).toEqual(['1', '3']);
		expect(foreign.map((o) => o.nodeId)).toEqual(['2']);
	});

	it('keeps everything when no layer is foreign', () => {
		expect(partitionOwners(all, new Set()).foreign).toEqual([]);
	});
});
