// src/ui/preview/ImportModal.test.ts — the import sub-surface mounts with its designed parts (574:1411).
//
// Same technique as src/ui/export/ExportModal.test.ts: rendered with `react-dom/server` in plain
// Node, so it fails on a real regression (a throwing component, a control deleted) rather than on a
// reformat. It cannot prove the file picker opens or that parsing runs — that is an in-Figma check.
import { createElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

let markup = '';

beforeAll(async () => {
	const [{ renderToStaticMarkup }, { ImportModal }] = await Promise.all([
		import('react-dom/server'),
		import('./ImportModal'),
	]);
	markup = renderToStaticMarkup(
		createElement(ImportModal, { languages: ['de'], onClose: () => {}, onImport: () => {}, error: null }),
	);
});

describe('ImportModal', () => {
	it('mounts as a modal dialog titled Import', () => {
		expect(markup).toContain('role="dialog"');
		expect(markup).toContain('aria-label="Import"');
	});

	it('carries the designed body and footer', () => {
		expect(markup).toContain('No file selected');
		expect(markup).toContain('Format is detected from the file extension — JSON or CSV.');
		expect(markup).toContain('Choose file…');
		expect(markup).toContain('accept=".json,.csv"');
		expect(markup).toContain('>Cancel<');
	});

	it('starts with Import disabled — nothing chosen yet', () => {
		expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Import<\/button>/);
	});

	it('announces the panel error line politely', async () => {
		const [{ renderToStaticMarkup }, { ImportModal }] = await Promise.all([
			import('react-dom/server'),
			import('./ImportModal'),
		]);
		const html = renderToStaticMarkup(
			createElement(ImportModal, { languages: [], onClose: () => {}, onImport: () => {}, error: 'Nope' }),
		);
		expect(html).toMatch(/<span[^>]*aria-live="polite"[^>]*>Nope<\/span>/);
	});
});

describe('importReadiness', () => {
	let importReadiness: typeof import('./ImportModal').importReadiness;
	beforeAll(async () => {
		({ importReadiness } = await import('./ImportModal'));
	});

	it('detects the format from the extension, case-insensitively', () => {
		expect(importReadiness(null, '', false).kind).toBeNull();
		expect(importReadiness('a.JSON', '', false).kind).toBe('json');
		expect(importReadiness('a.csv', '', false).kind).toBe('csv');
		expect(importReadiness('a.txt', '', false).kind).toBe('other');
	});

	it('is ready for a CSV, or a JSON with a valid language', () => {
		expect(importReadiness('a.csv', '', false).enabled).toBe(true);
		expect(importReadiness('a.json', '', false).enabled).toBe(false);
		expect(importReadiness('a.json', 'de', false)).toMatchObject({ canonical: 'de', enabled: true });
		expect(importReadiness('a.json', 'zz-!!', false)).toMatchObject({ languageInvalid: true, enabled: false });
		expect(importReadiness('a.txt', '', false).enabled).toBe(false);
	});

	// A second click while the first import is still saving would send it twice (LS-34).
	it('keeps the primary disabled while an import is in flight', () => {
		expect(importReadiness('a.csv', '', true).enabled).toBe(false);
		expect(importReadiness('a.json', 'de', true).enabled).toBe(false);
	});
});

describe('readImportFile', () => {
	let readImportFile: typeof import('./ImportModal').readImportFile;
	beforeAll(async () => {
		({ readImportFile } = await import('./ImportModal'));
	});

	it('returns the file text', async () => {
		expect(await readImportFile({ text: () => Promise.resolve('{"a":"b"}') })).toBe('{"a":"b"}');
	});

	// A file removed or locked between choosing and Import rejects `text()` (§2.1.7's unreadable path).
	it('reports an unreadable file as a parse error with the unreadable copy', async () => {
		expect(await readImportFile({ text: () => Promise.reject(new Error('NotReadableError')) })).toEqual({
			error: "This file couldn't be read.",
		});
	});
});
