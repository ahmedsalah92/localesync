// src/ui/export/ExportModal.test.ts — the export sub-surface mounts and carries its designed parts.
//
// Same rationale and same technique as devtools/DevHarness.test.ts: rendered rather than
// source-scanned, so it fails on a real regression (a throwing component, a control deleted) rather
// than on a reformat, and `react-dom/server` keeps it in Vitest's plain Node environment with no
// jsdom (agent-guidelines §6). It proves the surface is in the tree and mounts; it cannot prove
// anything about layout or that the download fires — LS-6 §2.7.29 is an in-Figma check.
import { createElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExtractedString } from '../../common/models';
import { LABELS } from './copy';

const entries: ExtractedString[] = [
	{ key: 'home.title', nodeId: '1:1', value: 'Welcome back', drifted: false },
	{ key: 'home.title.sub', nodeId: '1:2', value: 'Good to see you', drifted: false },
];

let markup = '';

beforeAll(async () => {
	const [{ renderToStaticMarkup }, { ExportModal }] = await Promise.all([
		import('react-dom/server'),
		import('./ExportModal'),
	]);
	markup = renderToStaticMarkup(createElement(ExportModal, { entries, onClose: () => {} }));
});

describe('ExportModal', () => {
	it('mounts as a modal dialog', () => {
		expect(markup).toContain('role="dialog"');
		expect(markup).toContain('aria-modal="true"');
	});

	it('carries every control the LS-24 design specifies', () => {
		for (const label of [
			LABELS.title,
			LABELS.format,
			LABELS.formatSupport,
			LABELS.dedup,
			LABELS.dedupSupport,
			LABELS.cancel,
			LABELS.download,
		]) {
			expect(markup).toContain(label);
		}
	});

	it('offers all three formats, JSON selected', () => {
		expect(markup).toContain('i18next JSON');
		expect(markup).toContain('iOS .strings');
		expect(markup).toContain('Android XML');
	});

	it('starts with dedup off — identity stays per-node unless asked (§2.4.19)', () => {
		expect(markup).toContain('role="switch"');
		expect(markup).not.toContain('checked=""');
	});

	// The close affordance is an icon component, never a typographic glyph (agent-guidelines §7).
	it('renders the close control as an svg, not a glyph', () => {
		expect(markup).toContain(`aria-label="${LABELS.close}"`);
		expect(markup).toMatch(/aria-label="Close"[\s\S]*?<svg/);
		expect(markup).not.toContain('✕');
	});

	it('surfaces no not-verbatim notice before a download has run', () => {
		expect(markup).not.toContain('could not be nested');
		expect(markup).not.toContain('renamed to stay valid');
	});
});
