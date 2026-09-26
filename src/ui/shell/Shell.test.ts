import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { panelVisibility, selectPanel } from './tabs';
import type { PanelId } from './panels';

const ids: PanelId[] = ['overflow', 'extract', 'preview', 'pseudo', 'rtl'];
const fixture = ids.map((id) => ({ id }));

describe('selectPanel', () => {
	it.each(ids)('selecting %s yields that panel', (id) => {
		expect(selectPanel(fixture, id).id).toBe(id);
	});
});

describe('panelVisibility — every panel mounted, one visible (LS-34)', () => {
	it('returns every panel in registry order with only the active one visible', () => {
		expect(panelVisibility(fixture, 'preview').map((p) => [p.panel.id, p.visible])).toEqual([
			['overflow', false],
			['extract', false],
			['preview', true],
			['pseudo', false],
			['rtl', false],
		]);
	});

	it('throws on an unknown id, like selectPanel', () => {
		expect(() => panelVisibility(fixture, 'nope' as PanelId)).toThrow('Unknown panel id: nope');
	});
});

// Rendered, not source-scanned (same technique as pseudo/PseudoPanel.test.ts): the inactive panels
// must stay mounted but carry `hidden`, which takes them out of the Tab order and the a11y tree.
describe('Shell — hidden panel wrappers (LS-34)', () => {
	it('renders every panel, with all but the active one hidden', async () => {
		// Shell pulls in the real panels, and through them `src/ui/bridge.ts`, which claims a `window`
		// 'message' listener at module scope. Stub before the dynamic imports.
		vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
		const [{ renderToStaticMarkup }, { Shell }] = await Promise.all([
			import('react-dom/server'),
			import('./Shell'),
		]);
		const panels = ids.map((id) => ({
			id,
			label: id,
			Panel: () => createElement('p', { 'data-panel': id }, id),
		}));
		const html = renderToStaticMarkup(createElement(Shell, { panels, initialPanel: 'preview' }));
		for (const id of ids) expect(html).toContain(`data-panel="${id}"`);
		const wrappers = [...html.matchAll(/<div([^>]*)><p data-panel="([a-z]+)"/g)];
		expect(wrappers.map(([, attrs, id]) => [id, / hidden=""/.test(attrs ?? '')])).toEqual([
			['overflow', true],
			['extract', true],
			['preview', false],
			['pseudo', true],
			['rtl', true],
		]);
		vi.unstubAllGlobals();
	});
});
