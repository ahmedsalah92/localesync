// src/ui/export/index.ts — the single entry point (docs/specs/LS-6.md §1.3) plus the download.
//
// Export is UI-local and nothing crosses the bridge: docs/specs/LS-2.md §303 settles that there is
// no `export-request`/`export-result`. The UI already holds `ExtractedString[]` from
// `extraction-result`, serialization is pure, and the download needs the DOM the main thread lacks.
import type { ExtractedString } from '../../common/models';
import { serializeAndroid } from './android';
import { applyDedup } from './dedup';
import { serializeIos } from './ios';
import { serializeJson } from './json';
import type { ExportFormat, ExportOptions, ExportResult } from './types';

/** §2.7.28. */
const FILES: Record<ExportFormat, { filename: string; mimeType: string }> = {
	json: { filename: 'translations.json', mimeType: 'application/json' },
	ios: { filename: 'Localizable.strings', mimeType: 'text/plain' },
	android: { filename: 'strings.xml', mimeType: 'application/xml' },
};

/**
 * Pure and DOM-free, so Vitest covers it without a browser environment (agent-guidelines §6).
 *
 * Dedup runs first: it removes entries, so the JSON prefix-collision check and the Android name
 * assignment both see the final set rather than one that still contains collapsed duplicates.
 *
 * Output order is input document order throughout, never sorted (§2.6.25) — byte-for-byte
 * reproducibility is required because §3.3 diffs against goldens.
 */
export function serialize(entries: readonly ExtractedString[], options: ExportOptions): ExportResult {
	const { entries: source, keyMap: dedupKeyMap } = options.dedup
		? applyDedup(entries)
		: { entries: [...entries], keyMap: [] };

	const file = FILES[options.format];

	switch (options.format) {
		case 'json': {
			const { content, omitted } = serializeJson(source);
			return { content, ...file, keyMap: dedupKeyMap, omitted };
		}
		case 'ios':
			return { content: serializeIos(source), ...file, keyMap: dedupKeyMap, omitted: [] };
		case 'android': {
			const { content, keyMap } = serializeAndroid(source);
			return { content, ...file, keyMap: [...dedupKeyMap, ...keyMap], omitted: [] };
		}
	}
}

/**
 * Hand the file to the user. A Blob plus a programmatic anchor click — the only route available
 * from the plugin iframe (§2.7.27).
 *
 * The object URL is revoked on the next tick rather than immediately: Safari and some Chromium
 * builds abort a download whose blob URL is revoked in the same task as the click.
 */
export function downloadExport(result: ExportResult): void {
	const blob = new Blob([result.content], { type: `${result.mimeType};charset=utf-8` });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = result.filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type { ExportFormat, ExportOptions, ExportResult, KeyMapEntry, OmittedEntry } from './types';
