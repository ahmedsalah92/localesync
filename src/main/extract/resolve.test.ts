// src/main/extract/resolve.test.ts — pure unit tests for the ownership rules (no `figma`, no DOM).
//
// Rules 6–13 over plain data. Whether Figma actually copies a stamp on duplicate, or keeps ids on
// file duplication, is §3.4 probe territory and proved only by the in-Figma harness.
import { describe, expect, it } from 'vitest';
import { resolveKeys, type KeyInput, type PageStamp } from './resolve';
import type { StoredKey } from './persist';

const NOW = 5000;

function node(nodeId: string, name: string, frames: string[], stored: StoredKey | null = null): KeyInput {
	return { nodeId, name, ancestorFrameNames: frames, stored };
}

/** A stamp as read. `t` omitted = a pre-`t` stamp. */
const stamp = (k: string, n: string, t?: number, s: StoredKey['s'] = 'dot'): StoredKey =>
	t === undefined ? { k, s, n } : { k, s, n, t };

/** A stamp as this pass writes it. */
const written = (k: string, n: string, s: StoredKey['s'] = 'dot') => ({ k, s, n, t: NOW });

const resolve = (inputs: KeyInput[], page?: PageStamp[], scheme: StoredKey['s'] = 'dot') =>
	resolveKeys(inputs, scheme, { now: NOW, ...(page === undefined ? {} : { page }) });

const outside = (nodeId: string, stored: StoredKey | null): PageStamp => ({ nodeId, stored });

describe('resolveKeys — unstamped nodes (rule 13)', () => {
	it('derives, suffixes collisions (rule 6) and stamps every node with t = now', () => {
		const out = resolve([
			node('1:1', 'Total', ['Summary']),
			node('1:2', 'Total', ['Summary']),
			node('1:3', 'Title', []),
		]);
		expect(out.map((r) => r.key)).toEqual(['summary.total', 'summary.total_2', 'title']);
		expect(out.map((r) => r.write)).toEqual([
			written('summary.total', '1:1'),
			written('summary.total_2', '1:2'),
			written('title', '1:3'),
		]);
		expect(out.every((r) => !r.drifted)).toBe(true);
	});

	it('stamps under the requested scheme', () => {
		const [out] = resolve([node('1:1', 'Total', ['Summary'])], undefined, 'snake');
		expect(out?.write).toEqual(written('summary_total', '1:1', 'snake'));
	});
});

describe('resolveKeys — owners (rules 7, 9)', () => {
	it('an owner keeps its key verbatim and writes nothing — a rescan is a no-op', () => {
		const first = resolve([node('1:1', 'Total', ['Summary']), node('1:2', 'Total', ['Summary'])]);
		const rescan = resolve(first.map((r) => node(r.nodeId, 'Total', ['Summary'], r.write)));
		expect(rescan.map((r) => r.key)).toEqual(['summary.total', 'summary.total_2']);
		expect(rescan.every((r) => r.write === null)).toBe(true);
		// The suffixed key re-derives to the bare base — that is not drift.
		expect(rescan.map((r) => r.drifted)).toEqual([false, false]);
	});

	it('reserves owned keys before deriving, so a new node never takes one (rule 7)', () => {
		// The owner sits AFTER the new node in document order and must still win.
		const out = resolve([
			node('1:9', 'Total', ['Summary']),
			node('1:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 10)),
		]);
		expect(out.map((r) => r.key)).toEqual(['summary.total_2', 'summary.total']);
		expect(out[1]?.write).toBeNull();
	});

	it('an owner keeps its key regardless of position; a rename reports drift', () => {
		const [out] = resolve([node('1:1', 'Grand total', ['Cart'], stamp('summary.total', '1:1', 10))]);
		expect(out).toEqual({ nodeId: '1:1', key: 'summary.total', drifted: true, write: null });
	});

	it('Welcome → Welcome 2 is a genuine rename and reports drift (derivesFrom is asymmetric)', () => {
		const [out] = resolve([node('1:1', 'Welcome 2', ['Home'], stamp('home.welcome', '1:1', 10))]);
		expect(out?.key).toBe('home.welcome');
		expect(out?.drifted).toBe(true);
	});

	it('drift is measured under the stamp scheme, not the requested one', () => {
		const [out] = resolve([node('1:1', 'Total', ['Summary'], stamp('summary_total', '1:1', 10, 'snake'))]);
		expect(out?.key).toBe('summary_total');
		expect(out?.drifted).toBe(false);
	});
});

describe('resolveKeys — same-key tiebreak by stamp time', () => {
	// In every case the winner is the LATER node in document order, so document order cannot be what
	// decides it. The loser is treated as a copy: re-derived, suffixed, re-stamped.
	it('an absent t beats a present t — it predates the field', () => {
		const out = resolve([
			node('1:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 1)),
			node('1:2', 'Total', ['Summary'], stamp('summary.total', '1:2')),
		]);
		expect(out.map((r) => r.key)).toEqual(['summary.total_2', 'summary.total']);
		expect(out[0]?.write).toEqual(written('summary.total_2', '1:1'));
		expect(out[1]?.write).toBeNull();
	});

	it('an adopted legacy claim (t: 0) beats a real timestamp', () => {
		const out = resolve([
			node('1:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 1757548800000)),
			node('1:2', 'Total', ['Summary'], stamp('summary.total', '1:2', 0)),
		]);
		expect(out.map((r) => r.key)).toEqual(['summary.total_2', 'summary.total']);
		expect(out[1]?.write).toBeNull();
	});

	it('an absent t and t: 0 are the same age — a tie, broken by document order', () => {
		const absentFirst = resolve([
			node('1:1', 'Total', ['Summary'], stamp('summary.total', '1:1')),
			node('1:2', 'Total', ['Summary'], stamp('summary.total', '1:2', 0)),
		]);
		expect(absentFirst.map((r) => r.key)).toEqual(['summary.total', 'summary.total_2']);
		const zeroFirst = resolve([
			node('1:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 0)),
			node('1:2', 'Total', ['Summary'], stamp('summary.total', '1:2')),
		]);
		expect(zeroFirst.map((r) => r.key)).toEqual(['summary.total', 'summary.total_2']);
	});

	it('the smaller t wins', () => {
		const out = resolve([
			node('1:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 200)),
			node('1:2', 'Total', ['Summary'], stamp('summary.total', '1:2', 100)),
		]);
		expect(out.map((r) => r.key)).toEqual(['summary.total_2', 'summary.total']);
	});

	it('a genuine tie falls back to document order', () => {
		const tied = [
			node('1:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 100)),
			node('1:2', 'Total', ['Summary'], stamp('summary.total', '1:2', 100)),
		];
		expect(resolve(tied).map((r) => r.key)).toEqual(['summary.total', 'summary.total_2']);
		const bothAbsent = [
			node('1:1', 'Total', ['Summary'], stamp('summary.total', '1:1')),
			node('1:2', 'Total', ['Summary'], stamp('summary.total', '1:2')),
		];
		expect(resolve(bothAbsent).map((r) => r.key)).toEqual(['summary.total', 'summary.total_2']);
	});

	it('document order for the tie is page order, not input order', () => {
		const a = node('1:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 100));
		const b = node('1:2', 'Total', ['Summary'], stamp('summary.total', '1:2', 100));
		const page = [outside('1:2', b.stored), outside('1:1', a.stored)];
		expect(resolve([a, b], page).map((r) => r.key)).toEqual(['summary.total_2', 'summary.total']);
	});
});

describe('resolveKeys — copies (rule 10)', () => {
	it('a duplicate of a present owner re-derives and suffixes; the original keeps its key', () => {
		const copied = stamp('summary.total', '1:1', 10);
		const out = resolve([node('1:1', 'Total', ['Summary'], copied), node('1:5', 'Total', ['Summary'], copied)]);
		expect(out.map((r) => r.key)).toEqual(['summary.total', 'summary.total_2']);
		expect(out[0]?.write).toBeNull();
		expect(out[1]?.write).toEqual(written('summary.total_2', '1:5'));
	});

	it('holds when the copy precedes the original in document order', () => {
		const copied = stamp('summary.total', '1:1', 10);
		const out = resolve([node('1:5', 'Total', ['Summary'], copied), node('1:1', 'Total', ['Summary'], copied)]);
		expect(out.map((r) => r.key)).toEqual(['summary.total_2', 'summary.total']);
	});

	it('a copy moved to a new frame derives from where it now sits', () => {
		const copied = stamp('summary.total', '1:1', 10);
		const out = resolve([node('1:1', 'Total', ['Summary'], copied), node('1:5', 'Total', ['Cart'], copied)]);
		expect(out[1]?.key).toBe('cart.total');
	});
});

describe('resolveKeys — adoption (rule 11) and ambiguity (rule 12)', () => {
	it('a sole carrier of an absent owner adopts: key unchanged, re-stamped with its own id and the claim age', () => {
		const [out] = resolve([node('9:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 42))]);
		expect(out).toEqual({
			nodeId: '9:1',
			key: 'summary.total',
			drifted: false,
			write: { k: 'summary.total', s: 'dot', n: '9:1', t: 42 },
		});
	});

	it('adopting a pre-t stamp writes t: 0 — the oldest possible claim — never now', () => {
		const [out] = resolve([node('9:1', 'Total', ['Summary'], stamp('summary.total', '1:1'))]);
		expect(out?.write).toEqual({ k: 'summary.total', s: 'dot', n: '9:1', t: 0 });
		expect(out?.write?.t).not.toBe(NOW);
	});

	it('adopting a stamp that has a t preserves it unchanged', () => {
		const [out] = resolve([node('9:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 1234))]);
		expect(out?.write?.t).toBe(1234);
	});

	it('an adopter keeps the scheme it was stamped with', () => {
		const [out] = resolve([node('9:1', 'Total', ['Summary'], stamp('summary_total', '1:1', 42, 'snake'))]);
		expect(out?.write).toEqual({ k: 'summary_total', s: 'snake', n: '9:1', t: 42 });
	});

	it('an adopted key is reserved before derivation runs', () => {
		const out = resolve([
			node('9:0', 'Total', ['Summary']),
			node('9:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 42)),
		]);
		expect(out.map((r) => r.key)).toEqual(['summary.total_2', 'summary.total']);
	});

	it('several carriers of an absent owner: none adopts, all re-derive', () => {
		const orphan = stamp('summary.total', '1:1', 42);
		const out = resolve([node('9:1', 'Total', ['Summary'], orphan), node('9:2', 'Total', ['Summary'], orphan)]);
		expect(out.map((r) => r.key)).toEqual(['summary.total', 'summary.total_2']);
		expect(out.map((r) => r.write)).toEqual([written('summary.total', '9:1'), written('summary.total_2', '9:2')]);
	});

	it('an adopter whose key an owner already holds re-derives instead', () => {
		const out = resolve([
			node('1:2', 'Total', ['Summary'], stamp('summary.total', '1:2', 10)),
			node('9:1', 'Total', ['Summary'], stamp('summary.total', '1:1', 42)),
		]);
		expect(out.map((r) => r.key)).toEqual(['summary.total', 'summary.total_2']);
	});
});

describe('resolveKeys — page-wide claims under a selection scope', () => {
	it('a selection scan never mints a key owned by a node outside the selection', () => {
		const inside = node('2:1', 'Total', ['Summary']);
		const page = [outside('1:1', stamp('summary.total', '1:1', 10)), outside('2:1', null)];
		const [out] = resolve([inside], page);
		expect(out?.key).toBe('summary.total_2');
		expect(out?.write).toEqual(written('summary.total_2', '2:1'));
	});

	it('a copy scanned without its original does not take over the original key', () => {
		const copied = stamp('summary.total', '1:1', 10);
		const page = [outside('1:1', copied), outside('2:1', copied)];
		const [out] = resolve([node('2:1', 'Total', ['Summary'], copied)], page);
		expect(out?.key).toBe('summary.total_2');
	});

	it('an out-of-scope carrier makes an in-scope carrier ambiguous (rule 12, page-wide)', () => {
		const orphan = stamp('summary.total', '0:0', 10);
		const page = [outside('2:1', orphan), outside('3:1', orphan)];
		const [out] = resolve([node('2:1', 'Total', ['Summary'], orphan)], page);
		// Not adopted: the key is free, so it re-derives to the same string — but under a fresh stamp.
		expect(out?.write).toEqual(written('summary.total', '2:1'));
	});

	it('an in-scope owner loses to an older owner outside the scope, and re-derives', () => {
		const page = [
			outside('1:1', stamp('summary.total', '1:1', 5)),
			outside('2:1', stamp('summary.total', '2:1', 9)),
		];
		const [out] = resolve([node('2:1', 'Total', ['Summary'], stamp('summary.total', '2:1', 9))], page);
		expect(out?.key).toBe('summary.total_2');
	});

	it('returns only in-scope nodes', () => {
		const page = [outside('1:1', stamp('a', '1:1', 1)), outside('2:1', null), outside('3:1', null)];
		const out = resolve([node('2:1', 'B', [])], page);
		expect(out.map((r) => r.nodeId)).toEqual(['2:1']);
	});
});

describe('resolveKeys — output shape', () => {
	it('preserves input order and length', () => {
		const inputs = [node('3', 'C', []), node('1', 'A', []), node('2', 'B', [])];
		expect(resolve(inputs).map((r) => r.nodeId)).toEqual(['3', '1', '2']);
	});

	it('yields every key exactly once', () => {
		const orphan = stamp('x.total', '0:0', 10);
		const out = resolve([
			node('1', 'Total', ['X'], stamp('x.total', '1', 10)),
			node('2', 'Total', ['X'], stamp('x.total', '1', 10)),
			node('3', 'Total', ['X'], orphan),
			node('4', 'Total', ['X'], orphan),
			node('5', 'Total', ['X']),
			node('6', 'Total', ['X'], stamp('x.total', '6', 3)),
		]);
		expect(new Set(out.map((r) => r.key)).size).toBe(out.length);
	});

	it('is empty for no input', () => {
		expect(resolve([])).toEqual([]);
	});
});
