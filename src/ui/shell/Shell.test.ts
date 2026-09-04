import { describe, expect, it } from 'vitest';
import { selectPanel } from './tabs';
import type { PanelId } from './panels';

const ids: PanelId[] = ['overflow', 'extract', 'preview', 'pseudo', 'rtl'];
const fixture = ids.map((id) => ({ id }));

describe('selectPanel', () => {
	it.each(ids)('selecting %s yields that panel', (id) => {
		expect(selectPanel(fixture, id).id).toBe(id);
	});
});
