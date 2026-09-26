// src/ui/preview/parse.ts — the Phase-1 import formats (LS-12 §2.1). Pure: no DOM, no bridge.
//
// Values are kept verbatim. An empty value means "no translation" and is dropped, so the layer
// falls back to source rather than being blanked.
import type { PreviewMap } from '../../common/models';
import { canonicalLocale } from './locale';

export interface ParseError {
	error: string;
}
type Entry = { key: string; value: string };

export function isParseError(x: unknown): x is ParseError {
	return typeof x === 'object' && x !== null && 'error' in x;
}

/** Nested (LS-6's i18next output), flat dotted keys, or a mix — flattened on `.`. */
export function parseJsonTranslations(text: string): { entries: Entry[] } | ParseError {
	let root: unknown;
	try {
		root = JSON.parse(text);
	} catch {
		return { error: "This file isn't valid JSON." };
	}
	if (typeof root !== 'object' || root === null || Array.isArray(root)) {
		return { error: 'The JSON must be an object of keys and translations.' };
	}
	const entries: Entry[] = [];
	const seen = new Set<string>();
	const walk = (node: object, prefix: string): ParseError | null => {
		for (const [segment, value] of Object.entries(node)) {
			const key = prefix === '' ? segment : `${prefix}.${segment}`;
			if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				const failed = walk(value, key);
				if (failed !== null) return failed;
				continue;
			}
			if (typeof value !== 'string') return { error: `"${key}" is not text — every value must be a string.` };
			if (seen.has(key)) return { error: `"${key}" appears more than once.` };
			seen.add(key);
			if (value !== '') entries.push({ key, value });
		}
		return null;
	};
	const failed = walk(root, '');
	return failed ?? { entries };
}

/** RFC 4180 records. Returns the 1-based line each record starts on, for error messages. */
function records(text: string): { cells: string[]; line: number }[] | ParseError {
	const input = text.startsWith('﻿') ? text.slice(1) : text;
	const out: { cells: string[]; line: number }[] = [];
	let cells: string[] = [];
	let cell = '';
	let quoted = false;
	let line = 1;
	let recordLine = 1;
	for (let i = 0; i < input.length; i++) {
		const c = input[i];
		if (quoted) {
			if (c === '"' && input[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (c === '"') quoted = false;
			else {
				if (c === '\n') line++;
				cell += c;
			}
			continue;
		}
		if (c === '"' && cell === '') quoted = true;
		else if (c === ',') {
			cells.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && input[i + 1] === '\n') i++;
			cells.push(cell);
			out.push({ cells, line: recordLine });
			cells = [];
			cell = '';
			line++;
			recordLine = line;
		} else cell += c;
	}
	if (quoted) return { error: `Line ${recordLine} has an unclosed quote.` };
	if (cell !== '' || cells.length > 0) {
		cells.push(cell);
		out.push({ cells, line: recordLine });
	}
	return out.filter((r) => !(r.cells.length === 1 && r.cells[0] === ''));
}

/** A `key` column plus one column per locale → one map per locale, in column order. */
export function parseCsvTranslations(text: string): { maps: PreviewMap[] } | ParseError {
	const rows = records(text);
	if (isParseError(rows)) return rows;
	const [header, ...body] = rows;
	if (header === undefined) return { error: 'The CSV is empty.' };
	const keyColumns = header.cells.flatMap((cell, i) => (cell.trim().toLowerCase() === 'key' ? [i] : []));
	if (keyColumns.length !== 1) return { error: 'The CSV needs one column named "key".' };
	const keyColumn = keyColumns[0] as number;
	const columns: { index: number; language: string }[] = [];
	for (const [index, cell] of header.cells.entries()) {
		if (index === keyColumn) continue;
		const language = canonicalLocale(cell);
		if (language === null) return { error: `Column "${cell.trim()}" is not a language code.` };
		if (columns.some((c) => c.language === language)) return { error: `Language "${language}" has two columns.` };
		columns.push({ index, language });
	}
	const maps: PreviewMap[] = columns.map((c) => ({ language: c.language, entries: [] }));
	const seen = new Set<string>();
	for (const row of body) {
		// A spreadsheet export's blank separator row (`,,`) has cells, unlike a fully empty line
		// (already dropped by `records`), but every cell is empty. Skip it before the cell-count
		// check below, since such a row can have more commas than the header without being a real,
		// too-long record (final review fix).
		if (row.cells.every((cell) => cell === '')) continue;
		if (row.cells.length > header.cells.length)
			return { error: `Line ${row.line} has more cells than the header.` };
		const key = row.cells[keyColumn] ?? '';
		// A blank key cell with a non-empty translation cell is not a separator row — it's a real,
		// malformed record (final review fix).
		if (key === '') return { error: `Line ${row.line} has a translation but no key.` };
		if (seen.has(key)) return { error: `Key "${key}" appears more than once.` };
		seen.add(key);
		columns.forEach((column, i) => {
			const value = row.cells[column.index] ?? '';
			if (value !== '') maps[i]?.entries.push({ key, value });
		});
	}
	return { maps };
}
