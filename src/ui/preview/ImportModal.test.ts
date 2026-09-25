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
});
