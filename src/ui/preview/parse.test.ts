// src/ui/preview/parse.test.ts — the two Phase-1 import formats (LS-12 §2.1). Pure.
import { describe, expect, it } from 'vitest';
import { isParseError, parseCsvTranslations, parseJsonTranslations } from './parse';

const entries = (text: string) => {
	const result = parseJsonTranslations(text);
	if (isParseError(result)) throw new Error(result.error);
	return result.entries;
};

describe('parseJsonTranslations', () => {
	it('flattens LS-6 nested output, flat dotted keys, and a mix, identically', () => {
		const want = [
			{ key: 'home.title', value: 'Willkommen' },
			{ key: 'home.sub.line', value: 'Hallo' },
		];
		expect(entries('{"home":{"title":"Willkommen","sub":{"line":"Hallo"}}}')).toEqual(want);
		expect(entries('{"home.title":"Willkommen","home.sub.line":"Hallo"}')).toEqual(want);
		expect(entries('{"home":{"title":"Willkommen"},"home.sub.line":"Hallo"}')).toEqual(want);
	});

	it.each([
		['{"home":{"count":3}}', 'home.count'],
		['{"a":true}', 'a'],
		['{"a":null}', 'a'],
		['{"a":["x"]}', 'a'],
	])('rejects a non-string leaf in %s, naming %s', (text, key) => {
		const result = parseJsonTranslations(text);
		expect(isParseError(result) && result.error).toBe(`"${key}" is not text — every value must be a string.`);
	});

	// Review Focus 3: never silently pick one of two claims on the same key.
	it('rejects a key produced twice by nested and flat forms', () => {
		const result = parseJsonTranslations('{"a":{"b":"x"},"a.b":"y"}');
		expect(isParseError(result) && result.error).toBe('"a.b" appears more than once.');
	});

	it.each(['[]', '"text"', '3', 'null'])('rejects a top level that is not an object: %s', (text) => {
		expect(isParseError(parseJsonTranslations(text))).toBe(true);
	});

	it('rejects invalid JSON with a readable error', () => {
		const result = parseJsonTranslations('{"a":');
		expect(isParseError(result) && result.error).toBe("This file isn't valid JSON.");
	});

	it('drops empty values — they mean "no translation" and fall back', () => {
		expect(entries('{"a":"","b":"x"}')).toEqual([{ key: 'b', value: 'x' }]);
	});

	it('keeps values verbatim: unicode, quotes, backslashes, surrounding spaces', () => {
		expect(entries(String.raw`{"a":" مرحبا \"hi\" C:\\x "}`)).toEqual([{ key: 'a', value: ' مرحبا "hi" C:\\x ' }]);
	});
});

const maps = (text: string) => {
	const result = parseCsvTranslations(text);
	if (isParseError(result)) throw new Error(result.error);
	return result.maps;
};

describe('parseCsvTranslations', () => {
	it('reads the Definitions example into one map per locale column', () => {
		expect(maps('key,de,fr\nlogin.title,Anmelden,Connexion\n')).toEqual([
			{ language: 'de', entries: [{ key: 'login.title', value: 'Anmelden' }] },
			{ language: 'fr', entries: [{ key: 'login.title', value: 'Connexion' }] },
		]);
	});

	it('canonicalises locale headers and finds the key column in any position and case', () => {
		expect(maps('fr-fr, Key \nBonjour,home.title')).toEqual([
			{ language: 'fr-FR', entries: [{ key: 'home.title', value: 'Bonjour' }] },
		]);
	});

	// Review Focus 2.
	it('handles a BOM, CRLF, quoted commas, quoted line breaks and "" escapes byte-exactly', () => {
		const text = '\uFEFF"key","de"\r\na,"x, ""y""\r\nz"\r\n';
		expect(maps(text)).toEqual([{ language: 'de', entries: [{ key: 'a', value: 'x, "y"\r\nz' }] }]);
	});

	it('treats an empty cell as no translation, and pads short rows', () => {
		expect(maps('key,de,fr\na,,Salut\nb,Hallo')).toEqual([
			{ language: 'de', entries: [{ key: 'b', value: 'Hallo' }] },
			{ language: 'fr', entries: [{ key: 'a', value: 'Salut' }] },
		]);
	});

	it('skips fully empty lines', () => {
		expect(maps('key,de\n\na,x\n\n')).toEqual([{ language: 'de', entries: [{ key: 'a', value: 'x' }] }]);
	});

	// Final review fix: a spreadsheet export's blank separator row (`,,`) has cells, unlike a fully
	// empty line, but every cell is empty — it must be skipped, not treated as a `""` key.
	it('skips comma-separated blank rows (spreadsheet export separators), leaving the result unaffected', () => {
		expect(maps('key,de\n,\na,x\n,,')).toEqual([{ language: 'de', entries: [{ key: 'a', value: 'x' }] }]);
	});

	it('fails a row with a blank key cell that has a translation, naming its line', () => {
		const result = parseCsvTranslations('key,de\n,Hallo');
		expect(isParseError(result) && result.error).toBe('Line 2 has a translation but no key.');
	});

	it.each([
		['de,fr\nx,y', 'The CSV needs one column named "key".'],
		['key,KEY\nx,y', 'The CSV needs one column named "key".'],
		['key,zz-!!\nx,y', 'Column "zz-!!" is not a language code.'],
		['key,de,DE\nx,y,z', 'Language "de" has two columns.'],
		['key,de\na,x\na,y', 'Key "a" appears more than once.'],
		['key,de\na,x,extra', 'Line 2 has more cells than the header.'],
		['key,de\na,"unterminated', 'Line 2 has an unclosed quote.'],
		['', 'The CSV is empty.'],
	])('rejects %j', (text, error) => {
		const result = parseCsvTranslations(text);
		expect(isParseError(result) && result.error).toBe(error);
	});
});
