// src/main/extract/persist.test.ts — pure unit tests for the stamp codec (no `figma`, no DOM).
// readStoredKey/writeStoredKey touch a live node and are proved by the §3.3 harness, not here.
import { describe, expect, it } from 'vitest';
import { parseStoredKey, serializeStoredKey, type Stamp } from './persist';

describe('serializeStoredKey / parseStoredKey', () => {
	it.each<Stamp>([
		{ k: 'checkout.summary.total', s: 'dot', n: '12:34', t: 1757548800000 },
		{ k: 'checkout_summary_total', s: 'snake', n: 'I12:34;56:78', t: 0 },
	])('round-trips %j', (stored) => {
		expect(parseStoredKey(serializeStoredKey(stored))).toEqual(stored);
	});

	it('serializes the {k, s, n, t} envelope as JSON, in that order — t always present', () => {
		expect(serializeStoredKey({ k: 'home.title', s: 'dot', n: '1:2', t: 7 })).toBe(
			'{"k":"home.title","s":"dot","n":"1:2","t":7}',
		);
	});

	it('accepts a pre-t stamp and returns t as undefined', () => {
		const parsed = parseStoredKey('{"k":"home.title","s":"dot","n":"1:2"}');
		expect(parsed).toEqual({ k: 'home.title', s: 'dot', n: '1:2' });
		expect(parsed?.t).toBeUndefined();
	});

	it('accepts t: 0 and keeps it as 0 — an adopted legacy claim, not an absent t', () => {
		const parsed = parseStoredKey('{"k":"home.title","s":"dot","n":"1:2","t":0}');
		expect(parsed).not.toBeNull();
		expect(parsed?.t).toBe(0);
		expect(parsed && 't' in parsed).toBe(true);
	});

	it('drops unknown fields rather than carrying them through', () => {
		expect(parseStoredKey('{"k":"a","s":"dot","n":"1:2","t":3,"extra":true}')).toEqual({
			k: 'a',
			s: 'dot',
			n: '1:2',
			t: 3,
		});
	});
});

describe('parseStoredKey — malformed, empty or shape-wrong → null, never throws', () => {
	it.each([
		['empty (getPluginData with nothing stored)', ''],
		['not JSON', 'checkout.total'],
		['truncated JSON', '{"k":"a","s":"dot"'],
		['JSON null', 'null'],
		['JSON array', '["a","dot","1:2"]'],
		['JSON string', '"a"'],
		['JSON number', '42'],
		['missing k', '{"s":"dot","n":"1:2"}'],
		['empty k', '{"k":"","s":"dot","n":"1:2"}'],
		['non-string k', '{"k":7,"s":"dot","n":"1:2"}'],
		['unknown scheme', '{"k":"a","s":"kebab","n":"1:2"}'],
		['missing s', '{"k":"a","n":"1:2"}'],
		['missing n', '{"k":"a","s":"dot"}'],
		['empty n', '{"k":"a","s":"dot","n":""}'],
		['non-string n', '{"k":"a","s":"dot","n":12}'],
		['string t', '{"k":"a","s":"dot","n":"1:2","t":"1757548800000"}'],
		['null t', '{"k":"a","s":"dot","n":"1:2","t":null}'],
	])('%s', (_label, raw) => {
		expect(parseStoredKey(raw)).toBeNull();
	});
});
