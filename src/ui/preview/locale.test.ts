// src/ui/preview/locale.test.ts — pure, Node's Intl.
import { describe, expect, it } from 'vitest';
import { canonicalLocale, languageLabel, languageName } from './locale';

describe('canonicalLocale (LS-12 §2.1)', () => {
	it.each([
		['fr-fr', 'fr-FR'],
		['EN', 'en'],
		['pt-br', 'pt-BR'],
		['  de ', 'de'],
	])('%s → %s', (input, expected) => {
		expect(canonicalLocale(input)).toBe(expected);
	});

	it.each(['', 'xx-invalid-!!', 'not a locale', 'fr_FR'])('rejects %j', (input) => {
		expect(canonicalLocale(input)).toBeNull();
	});
});

describe('languageLabel — the banner and dropdown text', () => {
	it('names the base language and keeps the code', () => {
		expect(languageLabel('fr-FR')).toBe('French (fr-FR)');
		expect(languageLabel('de')).toBe('German (de)');
		expect(languageName('pt-BR')).toBe('Portuguese');
	});

	it('falls back to the bare code when there is no name', () => {
		expect(languageLabel('qaa')).toBe('qaa');
		expect(languageName('qaa')).toBe('qaa');
	});
});
