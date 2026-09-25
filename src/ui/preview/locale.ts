// src/ui/preview/locale.ts — language codes for Preview (LS-12 §2.1, §2.2). UI only: `Intl` is not
// available on the main thread.

/** Canonical BCP 47 (`fr-fr` → `fr-FR`), or null when the input is not a language tag. */
export function canonicalLocale(input: string): string | null {
	const trimmed = input.trim();
	if (trimmed === '') return null;
	try {
		const [canonical] = Intl.getCanonicalLocales(trimmed);
		return canonical ?? null;
	} catch {
		return null;
	}
}

const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

/** The base language's English name — `pt-BR` → `Portuguese` — or the code itself. */
export function languageName(code: string): string {
	const base = code.split('-')[0] ?? code;
	try {
		return names.of(base) ?? code;
	} catch {
		return code;
	}
}

/** `French (fr-FR)`, the design's banner and dropdown format; the bare code when unnamed. */
export function languageLabel(code: string): string {
	const name = languageName(code);
	return name === code ? code : `${name} (${code})`;
}
