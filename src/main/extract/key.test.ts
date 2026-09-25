// src/main/extract/key.test.ts — pure unit tests (no `figma`, no DOM).
//
// The case table is fixtures/extract-cases.json, a transcription of LS-9 §3.2 — the spec is the
// authority and the goldens derive from it, never independently (agent-guidelines §6).
import { describe, expect, it } from 'vitest';
import cases from '../../../fixtures/extract-cases.json';
import { deriveKey, derivesFrom, MAX_SEGMENT_CHARS, ReservedKeys, slugSegment, uniqueKey, type KeyScheme } from './key';

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
		expect(uniqueKey(row.base, new ReservedKeys(row.reserved))).toBe(row.expected);
	});

	it('does not mutate the reserved set', () => {
		const reserved = new ReservedKeys(['home.text']);
		expect(uniqueKey('home.text', reserved)).toBe('home.text_2');
		expect(uniqueKey('home.text', reserved)).toBe('home.text_2');
		expect(reserved.has('home.text_2')).toBe(false);
	});
});

describe('uniqueKey — ancestor paths (rule 6, LS-26)', () => {
	it('returns a colliding-free base byte-identical — no re-key without a collision', () => {
		const base = 'checkout.summary.total';
		// Shares both branches of `base` and a string prefix of every segment, yet collides with nothing.
		const reserved = new ReservedKeys([
			'checkout.summary.subtotal',
			'checkout.summary_note',
			'check',
			'home.title.sub',
		]);
		expect(uniqueKey(base, reserved)).toBe(base);
	});

	it('prefix claimed first: the longer key is suffixed at the colliding segment', () => {
		// Suffixing the leaf (`home.title.sub_2`) would leave `home.title` as both leaf and branch.
		expect(uniqueKey('home.title.sub', new ReservedKeys(['home.title']))).toBe('home.title_2.sub');
	});

	it('longer key claimed first: the prefix is suffixed', () => {
		expect(uniqueKey('home.title', new ReservedKeys(['home.title.sub']))).toBe('home.title_2');
	});

	it('both directions three levels apart', () => {
		expect(uniqueKey('a.b.c.d', new ReservedKeys(['a.b']))).toBe('a.b_2.c.d');
		expect(uniqueKey('a.b', new ReservedKeys(['a.b.c.d']))).toBe('a.b_2');
		expect(uniqueKey('a', new ReservedKeys(['a.b.c.d']))).toBe('a_2');
		expect(uniqueKey('a.b.c.d', new ReservedKeys(['a']))).toBe('a_2.b.c.d');
	});

	it('a suffixed segment is itself checked, and skips a taken suffix', () => {
		expect(uniqueKey('home.title.sub', new ReservedKeys(['home.title', 'home.title_2']))).toBe('home.title_3.sub');
		expect(uniqueKey('home.title', new ReservedKeys(['home.title.sub', 'home.title_2.x']))).toBe('home.title_3');
	});

	it('shares a branch another key already uses — a branch is a namespace, not a claim', () => {
		expect(uniqueKey('home.title.sub', new ReservedKeys(['home.title', 'home.title_2.other']))).toBe(
			'home.title_2.sub',
		);
		expect(uniqueKey('home.title.sub', new ReservedKeys(['home.title', 'home.title_2.sub']))).toBe(
			'home.title_2.sub_2',
		);
	});

	it('a string prefix is not a path prefix', () => {
		expect(uniqueKey('home.titles', new ReservedKeys(['home.title']))).toBe('home.titles');
		expect(uniqueKey('home.title', new ReservedKeys(['home.titles.sub']))).toBe('home.title');
	});

	it('snake keys hold no `.`, so they have no ancestor paths to collide on', () => {
		expect(uniqueKey('home_title_sub', new ReservedKeys(['home_title']))).toBe('home_title_sub');
		expect(uniqueKey('home_title', new ReservedKeys(['home_title_sub']))).toBe('home_title');
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

	it.each([
		// uniqueKey suffixes the colliding ANCESTOR segment (rule 6, LS-26); without a per-segment
		// allowance every such key would read as drifted on every scan.
		['home.title_2.sub', 'home.title.sub', true],
		['a.b_2.c.d', 'a.b.c.d', true],
		['home.title_2.sub_2', 'home.title.sub', true],
		['home.title.sub', 'home.title_2.sub', false], // still asymmetric, per segment
		['home.title_1.sub', 'home.title.sub', false],
		['a.b_2.c', 'a.b.c.d', false],
		['a.b.c.d', 'a.b.c', false],
		['home_2.sub', 'home.title.sub', false],
	])('per segment: %s from %s → %s', (key, base, expected) => {
		expect(derivesFrom(key, base)).toBe(expected);
	});
});
