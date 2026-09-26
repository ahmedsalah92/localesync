import { describe, expect, it } from 'vitest';
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
