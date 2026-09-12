// src/ui/export/android.test.ts — LS-6 §2.2. The format where LocaleSync diverges from Gleef.
import { describe, expect, it } from 'vitest';
import type { ExtractedString } from '../../common/models';
import { androidName, escapeAndroid, serializeAndroid } from './android';

const entry = (key: string, value: string, nodeId = key): ExtractedString => ({
	key,
	nodeId,
	value,
	drifted: false,
});

describe('escapeAndroid — anchored to Gleef where Gleef is correct', () => {
	it('escapes the three XML-reserved characters', () => {
		expect(escapeAndroid('Terms & Conditions')).toBe('Terms &amp; Conditions');
		expect(escapeAndroid('Use 5 > 3 and 2 < 4')).toBe('Use 5 &gt; 3 and 2 &lt; 4');
	});

	// The case a plausible implementation silently corrupts: the ampersand of an entity-looking
	// literal is still an ampersand. Gleef gets this right and the golden matches it.
	it('escapes the ampersand of a literal that already looks like an entity', () => {
		expect(escapeAndroid('&amp; is an ampersand')).toBe('&amp;amp; is an ampersand');
	});

	it('leaves % bare, so positional specifiers survive preserve-not-generate', () => {
		expect(escapeAndroid('50% off today')).toBe('50% off today');
		expect(escapeAndroid('%1$s got 50% off')).toBe('%1$s got 50% off');
	});
});

describe('escapeAndroid — deliberate divergences from Gleef', () => {
	it('escapes the backslash, and does so before the rules that introduce one', () => {
		// Without this, Android reads the \n of \name as a newline and the value is corrupted.
		expect(escapeAndroid('C:\\Users\\name')).toBe('C:\\\\Users\\\\name');
		// A literal backslash-n stays two characters rather than becoming a newline escape.
		expect(escapeAndroid('Line A\\nLine B')).toBe('Line A\\\\nLine B');
	});

	it('escapes apostrophes and double quotes, which Gleef leaves raw', () => {
		expect(escapeAndroid("Don't")).toBe("Don\\'t");
		expect(escapeAndroid('He said "hi"')).toBe('He said \\"hi\\"');
	});

	it('escapes a leading @ or ?, which Android reads as a reference', () => {
		expect(escapeAndroid('@designer')).toBe('\\@designer');
		expect(escapeAndroid('?shortcuts')).toBe('\\?shortcuts');
	});

	it('does not escape @ or ? away from the start', () => {
		expect(escapeAndroid('a@b')).toBe('a@b');
	});

	it('escapes interior newline and tab, which an unquoted value would collapse', () => {
		expect(escapeAndroid('12 High Street\nLondon')).toBe('12 High Street\\nLondon');
		expect(escapeAndroid('Name\tQuantity')).toBe('Name\\tQuantity');
	});

	it('quotes values with edge whitespace, which Android would otherwise trim', () => {
		expect(escapeAndroid('Save ')).toBe('"Save "');
		expect(escapeAndroid('   ')).toBe('"   "');
	});

	it('leaves an empty value unquoted', () => {
		expect(escapeAndroid('')).toBe('');
	});

	it('leaves U+2028 literal — not ASCII whitespace, so nothing collapses it', () => {
		expect(escapeAndroid('First\u2028Second')).toBe('First\u2028Second');
	});
});

describe('androidName', () => {
	it('remaps dots to underscores', () => {
		expect(androidName('checkout.summary.total')).toBe('checkout_summary_total');
	});

	it('prefixes a name that would not start with a letter', () => {
		expect(androidName('2024.summary')).toBe('key_2024_summary');
	});

	it('leaves an already-valid name alone', () => {
		expect(androidName('total')).toBe('total');
	});
});

describe('serializeAndroid', () => {
	it('records only genuine remap collisions, not every remapped key', () => {
		const { keyMap } = serializeAndroid([
			entry('nav.item_2', 'Second item', '1:1'),
			entry('nav.item.2', 'Item two', '1:2'),
			entry('home.title', 'Welcome', '1:3'),
		]);
		// home.title remaps to home_title but collides with nothing, so it is not traced.
		expect(keyMap).toEqual([
			{ nodeId: '1:2', from: 'nav.item.2', to: 'nav_item_2_2', reason: 'android-remap-collision' },
		]);
	});

	it('gives the first key in document order the un-suffixed name', () => {
		const { content } = serializeAndroid([entry('nav.item_2', 'A', '1:1'), entry('nav.item.2', 'B', '1:2')]);
		expect(content).toContain('<string name="nav_item_2">A</string>');
		expect(content).toContain('<string name="nav_item_2_2">B</string>');
	});

	it('emits the declaration, resources root and 2-space indent, with no trailing newline', () => {
		const { content } = serializeAndroid([entry('a.b', 'x')]);
		expect(content).toBe(
			'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="a_b">x</string>\n</resources>',
		);
	});
});
