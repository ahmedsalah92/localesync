// src/ui/export/ios.test.ts — LS-6 §2.3.
//
// Every expectation here was confirmed against Apple's own parser before it was written: the probe
// file passed `plutil -lint` and a `plutil -convert json` round-trip returned all 42 fixture values
// byte-identical (2026-09-12). These assertions pin that behaviour in CI, where plutil is not
// available to re-run.
import { describe, expect, it } from 'vitest';
import type { ExtractedString } from '../../common/models';
import { escapeIos, serializeIos } from './ios';

const entry = (key: string, value: string): ExtractedString => ({ key, nodeId: key, value, drifted: false });

describe('escapeIos', () => {
	it('escapes the backslash first, so later rules cannot double-escape', () => {
		expect(escapeIos('C:\\Users\\name')).toBe('C:\\\\Users\\\\name');
		expect(escapeIos('Line A\\nLine B')).toBe('Line A\\\\nLine B');
	});

	it('escapes double quotes', () => {
		expect(escapeIos('He said "hi"')).toBe('He said \\"hi\\"');
	});

	it('escapes newline, carriage return and tab', () => {
		expect(escapeIos('a\nb')).toBe('a\\nb');
		expect(escapeIos('a\rb')).toBe('a\\rb');
		expect(escapeIos('a\tb')).toBe('a\\tb');
	});

	// Verified against plutil: none of these need escaping in .strings, unlike Android.
	it('leaves apostrophes, ampersands, angle brackets and % alone', () => {
		expect(escapeIos("Don't")).toBe("Don't");
		expect(escapeIos('Terms & Conditions')).toBe('Terms & Conditions');
		expect(escapeIos('Use <b>bold</b>')).toBe('Use <b>bold</b>');
		expect(escapeIos('%1$s got 50% off')).toBe('%1$s got 50% off');
	});

	it('preserves edge whitespace without quoting, unlike Android', () => {
		expect(escapeIos('Save ')).toBe('Save ');
		expect(escapeIos('   ')).toBe('   ');
	});

	it('leaves U+2028 and combining marks untouched', () => {
		expect(escapeIos('First\u2028Second')).toBe('First\u2028Second');
		expect(escapeIos('Cafe\u0301')).toBe('Cafe\u0301');
	});
});

describe('serializeIos', () => {
	it('emits one "key" = "value"; per line with no trailing newline', () => {
		expect(serializeIos([entry('a.one', 'One'), entry('b.two', 'Two')])).toBe(
			'"a.one" = "One";\n"b.two" = "Two";',
		);
	});

	it('keeps dotted keys verbatim — no remapping, because .strings allows them', () => {
		expect(serializeIos([entry('checkout.summary.total', 'x')])).toContain('"checkout.summary.total" = ');
	});

	it('emits an empty value as an empty quoted string', () => {
		expect(serializeIos([entry('a.empty', '')])).toBe('"a.empty" = "";');
	});
});
