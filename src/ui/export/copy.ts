// src/ui/export/copy.ts
//
// Every user-facing string the export sub-surface renders, mirroring extract/copy.ts and
// overflow/copy.ts. LS-6 owns the *format*; LS-14 owns the *words* and edits this one file.
//
// The strings below are transcribed from the canvas (Export Modal, node 526:2258), not invented —
// LS-24 resolved them as part of DES-2, so they are final rather than placeholder.
import type { ExportFormat } from './types';

export const FORMATS: readonly { value: ExportFormat; label: string }[] = [
	{ value: 'json', label: 'i18next JSON' },
	{ value: 'ios', label: 'iOS .strings' },
	{ value: 'android', label: 'Android XML' },
];

export const LABELS = {
	/** The Extract summary-bar link that opens the modal. The chevron is an icon, not a glyph. */
	open: 'Export',
	title: 'Export',
	close: 'Close',
	format: 'Format',
	formatSupport: 'Choose the export format for your strings.',
	dedup: 'Remove duplicate strings',
	dedupSupport: 'Collapses identical values to a shared key. Export-only — canvas identity is unaffected.',
	cancel: 'Cancel',
	download: 'Download',
} as const;

/**
 * Shown after a download when the file could not carry every key verbatim. Both cases are rare by
 * construction — §2.1.2 and §2.2.13 — so this stays out of the way until one actually occurs.
 *
 * Wording is provisional: LS-14 owns the words, and the copy table settled under LS-24 Deliverable 5
 * does not cover these two outcomes (LS-6 §Carried forward).
 */
export function omittedNotice(count: number): string {
	const keys = count === 1 ? 'key' : 'keys';
	return `${count} ${keys} could not be nested and were left out — a key cannot be both a value and a group.`;
}

export function remappedNotice(count: number): string {
	const keys = count === 1 ? 'key was' : 'keys were';
	return `${count} ${keys} renamed to stay valid in Android.`;
}
