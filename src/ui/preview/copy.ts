// src/ui/preview/copy.ts — every user-facing Preview string (LS-12 §2.1–§2.5). The copy-table states
// are transcribed from design (544:1407); the rest is spec copy.
import { languageLabel, languageName } from './locale';
import type { PreviewState, SkippedReason } from './state';

export const LABELS = {
	language: 'Language',
	chooseLanguage: 'Choose a language',
	import: 'Import',
	tryAgain: 'Try Again',
	jump: 'Jump to node',
} as const;

export const STATES = {
	noLanguages: { headline: 'Nothing to preview yet', body: 'Import translations to preview them in place.' },
	noKeys: {
		headline: 'Nothing to preview yet',
		body: 'Extract strings first, then choose a language to preview translations in place.',
	},
	noText: { headline: 'No text layers here', body: 'This page has nothing to preview. Try another page.' },
	chooseLanguage: {
		headline: 'Choose a language',
		body: 'Pick a language above to preview its translations on this page.',
	},
	operationFailed: {
		headline: "Couldn't complete",
		body: 'The preview failed and your canvas was restored. Nothing was left changed.',
	},
	// Plan ruling R2 — the spec names no state for a failed edit save.
	storageFailed: {
		headline: "Couldn't save",
		body: "Your edit wasn't saved — LocaleSync's storage is full or unavailable.",
	},
} as const;

export const SKIPPED_REASON: Record<SkippedReason, string> = {
	'missing-font': 'font unavailable',
	'mixed-font-char-mutation': "mixed fonts — can't rewrite",
	'already-mutated': 'Pseudo-loc or RTL is active',
	empty: 'empty layer',
};

export const UNNAMED_LAYER = 'Unnamed layer';
export const EDITING_VERDICT = '•  editing';

export function appliedMessage(code: string): string {
	return `Preview: ${languageLabel(code)}`;
}

export function summaryCount(translated: number, total: number): string {
	return `${translated} of ${total} translated`;
}

export function fallbackVerdict(code: string): string {
	return `•  fallback — no ${languageName(code)} translation`;
}

export function busyLabel(s: PreviewState): string {
	if (s.phase === 'reverting') return 'Reverting preview…';
	if (s.phase === 'loading' || s.language === null) return 'Loading translations…';
	return `Applying ${languageName(s.language)}…`;
}

export function unmatchedGroup(n: number): string {
	return `${n} ${n === 1 ? 'key' : 'keys'} matched no layer`;
}

export function skippedGroup(n: number): string {
	return `${n} ${n === 1 ? 'layer' : 'layers'} skipped`;
}
