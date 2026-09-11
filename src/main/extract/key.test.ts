// src/main/extract/key.test.ts — pure unit tests (no `figma`, no DOM).
//
// The case table is fixtures/extract-cases.json, a transcription of LS-9 §3.2 — the spec is the
// authority and the goldens derive from it, never independently (agent-guidelines §6).
import { describe, expect, it } from 'vitest';
import cases from '../../../fixtures/extract-cases.json';
import { deriveKey, derivesFrom, MAX_SEGMENT_CHARS, slugSegment, uniqueKey, type KeyScheme } from './key';

describe('deriveKey — LS-9 §3.2 case table', () => {
	it('transcribes all twelve rows', () => {
		expect(cases.deriveKey).toHaveLength(12);
	});

	it.each(cases.deriveKey)('#$n $exercises → $expected', (row) => {
		const model = { name: row.name, ancestorFrameNames: row.ancestorFrameNames };
		expect(deriveKey(model, row.scheme as KeyScheme)).toBe(row.expected);
	});

	it('never reads characters — a copy edit cannot change the key', () => {
		const model = { name: 'Total', ancestorFrameNames: ['Summary'], characters: 'Gesamt' };
		expect(deriveKey(model, 'dot')).toBe('summary.total');
	});
});

describe('uniqueKey — LS-9 §3.2', () => {
	it.each(cases.uniqueKey)('$base against $reserved → $expected', (row) => {
		expect(uniqueKey(row.base, new Set(row.reserved))).toBe(row.expected);
	});

	it('does not mutate the reserved set', () => {
		const reserved = new Set(['home.text']);
		uniqueKey('home.text', reserved);
		expect([...reserved]).toEqual(['home.text']);
	});
});

describe('slugSegment', () => {
	it.each([
		['Sign in', 'sign_in'],
		['  Welcome back!  ', 'welcome_back'],
		['Home / Header', 'home_header'],
		['CTA—Primary', 'cta_primary'],
		['v2 Button', 'v2_button'],
		['الإجمالي', ''],
		['---', ''],
	])('%j → %j', (name, expected) => {
		expect(slugSegment(name)).toBe(expected);
	});

	it('cuts on the last _ at or before the cap', () => {
		expect(slugSegment('A very long descriptive layer name for the total')).toBe('a_very_long_descriptive_layer');
	});

	it('keeps exactly 32 characters when the cap lands on a word boundary', () => {
		// 32 characters, then a '_' at index 32.
		const name = 'abcdefghij abcdefghij abcdefghij extra';
		expect(slugSegment(name)).toBe('abcdefghij_abcdefghij_abcdefghij');
		expect(slugSegment(name)).toHaveLength(MAX_SEGMENT_CHARS);
	});

	it('hard-cuts a single unbroken word longer than the cap', () => {
		expect(slugSegment('x'.repeat(40))).toBe('x'.repeat(MAX_SEGMENT_CHARS));
	});
});

describe('derivesFrom(stored, derived)', () => {
	it('is asymmetric: the stamp may carry a suffix the derivation lacks, never the reverse', () => {
		// Welcome → Welcome 2: derives home.welcome_2 against stamp home.welcome — a genuine rename.
		expect(derivesFrom('home.welcome', 'home.welcome_2')).toBe(false);
		expect(derivesFrom('home.welcome_2', 'home.welcome')).toBe(true);
	});

	it('masks the accepted false negative: stamp list.item_2, layer renamed Item 2 → Item', () => {
		// Documented on derivesFrom — drift is advisory, and this one case is not reported.
		expect(derivesFrom('list.item_2', 'list.item')).toBe(true);
	});

	it.each([
		['checkout.total', 'checkout.total', true],
		['checkout.total_2', 'checkout.total', true],
		['checkout.total_17', 'checkout.total', true],
		['checkout.total_1', 'checkout.total', false], // uniqueKey never emits _1
		['checkout.total_02', 'checkout.total', false],
		['checkout.total_x', 'checkout.total', false],
		['checkout.subtotal', 'checkout.total', false],
		['summary.total', 'checkout.total', false],
	])('%s from %s → %s', (key, base, expected) => {
		expect(derivesFrom(key, base)).toBe(expected);
	});
});
