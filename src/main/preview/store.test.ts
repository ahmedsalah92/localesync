// src/main/preview/store.test.ts — pure unit tests (no `figma`).
import { describe, expect, it } from 'vitest';
import { applyEdit, emptyStore, languagesOf, mergeImport, parseStore, translationsFor } from './store';

const withDeFr = () =>
	mergeImport(emptyStore(), [
		{ language: 'fr', entries: [{ key: 'a', value: 'Bonjour' }] },
		{
			language: 'de',
			entries: [
				{ key: 'a', value: 'Hallo' },
				{ key: 'b', value: 'Tschüss' },
			],
		},
	]);

describe('mergeImport (LS-12 §2.1.6)', () => {
	it('replaces an imported language wholesale and leaves the others untouched', () => {
		const next = mergeImport(withDeFr(), [{ language: 'de', entries: [{ key: 'c', value: 'Neu' }] }]);
		expect(translationsFor(next, 'de')).toEqual({ c: 'Neu' });
		expect(translationsFor(next, 'fr')).toEqual({ a: 'Bonjour' });
	});

	it('drops empty values and never mutates its input', () => {
		const before = withDeFr();
		const snapshot = JSON.stringify(before);
		const next = mergeImport(before, [{ language: 'de', entries: [{ key: 'a', value: '' }] }]);
		expect(translationsFor(next, 'de')).toEqual({});
		expect(JSON.stringify(before)).toBe(snapshot);
	});
});

describe('applyEdit (LS-12 §2.3, D4)', () => {
	it('sets a value, and null or empty deletes it', () => {
		const set = applyEdit(withDeFr(), 'de', 'z', 'Neu');
		expect(translationsFor(set, 'de').z).toBe('Neu');
		expect(translationsFor(applyEdit(set, 'de', 'z', null), 'de').z).toBeUndefined();
		expect(translationsFor(applyEdit(set, 'de', 'z', ''), 'de').z).toBeUndefined();
	});
});

// Final-review fix: a per-language map must not be a plain object, or a `__proto__` key silently
// vanishes into the prototype instead of being stored as data (Object.prototype.__proto__'s setter
// ignores a non-object value), and it must never leak into Object.prototype for every other object.
describe('__proto__ as a translation key (final review fix)', () => {
	it('mergeImport stores it and translationsFor reads it back as a string, without polluting Object.prototype', () => {
		const store = mergeImport(emptyStore(), [{ language: 'de', entries: [{ key: '__proto__', value: 'Hallo' }] }]);
		expect(translationsFor(store, 'de').__proto__).toBe('Hallo');
		expect(({} as Record<string, unknown>).__proto__).not.toBe('Hallo');
	});

	it('applyEdit sets and deletes it as ordinary data, without polluting Object.prototype', () => {
		const set = applyEdit(emptyStore(), 'de', '__proto__', 'Hallo');
		expect(translationsFor(set, 'de').__proto__).toBe('Hallo');
		const deleted = applyEdit(set, 'de', '__proto__', null);
		expect(Object.prototype.hasOwnProperty.call(translationsFor(deleted, 'de'), '__proto__')).toBe(false);
		expect(({} as Record<string, unknown>).__proto__).not.toBe('Hallo');
	});

	it('parseStore round-trips it as a string, without polluting Object.prototype', () => {
		// `JSON.parse` (unlike an object literal) always creates a real own data property for
		// "__proto__", the same as a `clientStorage` round trip would hand back to `parseStore`.
		const raw = JSON.parse('{"v":1,"languages":{"de":{"__proto__":"Hallo"}}}');
		const store = parseStore(raw);
		expect(translationsFor(store, 'de').__proto__).toBe('Hallo');
		expect(({} as Record<string, unknown>).__proto__).not.toBe('Hallo');
	});
});

describe('languagesOf / parseStore', () => {
	it('sorts languages by code', () => {
		expect(languagesOf(withDeFr())).toEqual(['de', 'fr']);
	});

	it.each([undefined, null, 'x', { v: 2, languages: {} }, { v: 1, languages: { de: { a: 3 } } }])(
		'treats malformed stored data %j as empty — clientStorage is a cache',
		(raw) => {
			expect(parseStore(raw)).toEqual(emptyStore());
		},
	);

	it('round-trips a valid store', () => {
		const store = withDeFr();
		expect(parseStore(JSON.parse(JSON.stringify(store)))).toEqual(store);
	});
});
