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
