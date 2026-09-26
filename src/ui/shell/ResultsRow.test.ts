import { createElement, type FunctionComponent } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { isActivationKey, toneToken, type RowTone } from './ResultsRow';

describe('toneToken', () => {
	const cases: [RowTone, { strip: string; meta: string }][] = [
		['fits', { strip: '--ls-icon-success', meta: '--ls-text-secondary' }],
		['truncates', { strip: '--ls-icon-warning', meta: '--ls-text-warning' }],
		['overflows', { strip: '--ls-icon-danger', meta: '--ls-text-danger' }],
		['unmeasurable', { strip: '--ls-icon-tertiary', meta: '--ls-text-tertiary' }],
		['neutral', { strip: '--ls-border-neutral', meta: '--ls-text-tertiary' }],
		['editing', { strip: '--ls-text-brand', meta: '--ls-text-brand' }],
	];

	it.each(cases)('returns the §2.4 token for %s', (tone, expected) => {
		expect(toneToken(tone)).toEqual(expected);
	});
});

// Rendered rather than source-scanned, the same technique as export/ExportModal.test.ts:
// `react-dom/server` keeps it in Vitest's plain Node environment.
describe('ResultsRow trailing slot and depth (LS-28 §1.3)', () => {
	let render: (props: Record<string, unknown>) => string = () => '';

	beforeAll(async () => {
		const [{ renderToStaticMarkup }, { ResultsRow }] = await Promise.all([
			import('react-dom/server'),
			import('./ResultsRow'),
		]);
		// Loosely typed on purpose: the cases below include prop combinations `RowTrailing` rejects at
		// compile time only when written as JSX, and the test is about the rendered output.
		const Row = ResultsRow as unknown as FunctionComponent<Record<string, unknown>>;
		render = (props) => renderToStaticMarkup(createElement(Row, props));
	});

	const base = {
		tone: 'neutral',
		primary: 'Primary',
		meta: { label: 'meta' },
		selected: false,
		onSelect: () => {},
	};

	it('renders the jump button for a row built with today’s props', () => {
		const html = render({ ...base, onJump: () => {}, jumpLabel: 'Jump to node' });
		expect(html).toContain('<button');
		expect(html).not.toContain('data-disclosure');
	});

	it('renders no jump and no chevron when neither is given', () => {
		const html = render(base);
		expect(html).not.toContain('<button');
		expect(html).not.toContain('data-disclosure');
	});

	it('renders the open chevron when expanded, and no jump', () => {
		const html = render({ ...base, expanded: true });
		expect(html).toContain('data-disclosure="open"');
		expect(html).not.toContain('<button');
	});

	// A group row hides its children until opened, so a click-only div would leave keyboard and
	// screen-reader users unable to reach skipped layers at all (LS-28 final review).
	it('makes an expandable row a focusable disclosure button', () => {
		const html = render({ ...base, expanded: false });
		expect(html).toContain('role="button"');
		expect(html).toContain('tabindex="0"');
		expect(html).toContain('aria-expanded="false"');
		expect(render({ ...base, expanded: true })).toContain('aria-expanded="true"');
	});

	it('leaves jump and plain rows as they were — no role, no tab stop', () => {
		for (const html of [render(base), render({ ...base, onJump: () => {}, jumpLabel: 'Jump to node' })]) {
			expect(html).not.toContain('role="button"');
			expect(html).not.toContain('aria-expanded');
		}
	});

	it('activates a disclosure on Enter and Space only', () => {
		expect(['Enter', ' ', 'Tab', 'ArrowDown', 'a'].map(isActivationKey)).toEqual([true, true, false, false, false]);
	});

	it('renders the closed chevron when collapsed', () => {
		expect(render({ ...base, expanded: false })).toContain('data-disclosure="closed"');
	});

	it('insets a depth-1 row by 32px (--spacer-5) and a default row by 16px', () => {
		expect(render({ ...base, depth: 1 })).toContain('var(--spacer-5)');
		expect(render(base)).not.toContain('var(--spacer-5)');
	});

	it('renders an editable row focusable, with a double-click edit trigger', () => {
		const html = render({ ...base, onJump: () => {}, jumpLabel: 'Jump to node', onEdit: () => {} });
		expect(html).toContain('tabindex="0"');
		expect(html).toContain('data-editable="true"');
	});

	it('announces an editable row as a button with its edit label', () => {
		const html = render({ ...base, onEdit: () => {}, editLabel: 'Edit translation' });
		expect(html).toContain('role="button"');
		expect(html).toContain('aria-label="Edit translation"');
	});

	it('replaces the primary line with the editor when one is given', () => {
		const html = render({ ...base, editor: createElement('input', { value: 'Hallo', readOnly: true }) });
		expect(html).toContain('<input');
		expect(html).not.toContain('>Primary<');
	});
});
