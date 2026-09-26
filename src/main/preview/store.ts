// src/main/preview/store.ts — the imported translations for one file (LS-12 §1.4). Pure; the
// clientStorage I/O lives in ./persist. Every function returns a new store and never mutates.
import type { PreviewMap } from '../../common/models';

export interface PreviewStore {
	v: 1;
	languages: Record<string, Record<string, string>>;
}

export function emptyStore(): PreviewStore {
	return { v: 1, languages: {} };
}

/** clientStorage is a cache (agent-guidelines §2): anything malformed reads as empty, never throws. */
export function parseStore(raw: unknown): PreviewStore {
	if (typeof raw !== 'object' || raw === null) return emptyStore();
	const candidate = raw as { v?: unknown; languages?: unknown };
	if (candidate.v !== 1 || typeof candidate.languages !== 'object' || candidate.languages === null)
		return emptyStore();
	const languages: Record<string, Record<string, string>> = {};
	for (const [language, map] of Object.entries(candidate.languages)) {
		if (typeof map !== 'object' || map === null) return emptyStore();
		// Object.create(null) (final review fix): a plain `{}` inherits Object.prototype's `__proto__`
		// accessor, so `entries[key] = value` for a key literally named `__proto__` would silently do
		// nothing instead of storing the translation.
		const entries: Record<string, string> = Object.create(null);
		for (const [key, value] of Object.entries(map)) {
			if (typeof value !== 'string') return emptyStore();
			entries[key] = value;
		}
		languages[language] = entries;
	}
	return { v: 1, languages };
}

export function mergeImport(store: PreviewStore, maps: readonly PreviewMap[]): PreviewStore {
	const languages = { ...store.languages };
	for (const map of maps) {
		// Object.create(null) (final review fix) — see parseStore.
		const entries: Record<string, string> = Object.create(null);
		for (const { key, value } of map.entries) if (value !== '') entries[key] = value;
		languages[map.language] = entries;
	}
	return { v: 1, languages };
}

export function applyEdit(store: PreviewStore, language: string, key: string, value: string | null): PreviewStore {
	// Object.assign onto Object.create(null) (final review fix): a spread (`{ ...source }`) always
	// produces a plain, Object.prototype-carrying object regardless of `source`'s own prototype.
	const entries: Record<string, string> = Object.assign(Object.create(null), store.languages[language] ?? {});
	if (value === null || value === '') delete entries[key];
	else entries[key] = value;
	return { v: 1, languages: { ...store.languages, [language]: entries } };
}

export function languagesOf(store: PreviewStore): string[] {
	return Object.keys(store.languages).sort();
}

export function translationsFor(store: PreviewStore, language: string): Readonly<Record<string, string>> {
	return store.languages[language] ?? {};
}
