// src/ui/shell/ProStub.test.ts — the Pro waitlist stub (LS-13 §2.3). Rendered with react-dom/server,
// the same technique as export/ExportModal.test.ts, so Vitest stays in plain Node.
import { createElement } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PRO_LABEL, type ProPillar } from '../../common/pro';

const TOOLTIP =
	"Coming soon in Pro. Opens the waitlist in your browser. LocaleSync doesn't send any data from the plugin.";

let render: (pillar: ProPillar) => string = () => '';

beforeAll(async () => {
	// The default click handler pulls in ../bridge, which listens on `window` at module scope.
	vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
	const [{ renderToStaticMarkup }, { ProStub }] = await Promise.all([
		import('react-dom/server'),
		import('./ProStub'),
	]);
	render = (pillar) => renderToStaticMarkup(createElement(ProStub, { pillar }));
});

describe('ProStub', () => {
	it.each(['matrix', 'report', 'translate', 'sync'] as ProPillar[])(
		'renders the %s stub as one labelled button',
		(pillar) => {
			const html = render(pillar);
			expect(html.match(/<button/g)).toHaveLength(1);
			expect(html).toContain(`>${PRO_LABEL[pillar]}<`);
			expect(html).toContain('>Pro<');
			expect(html).toContain('<svg');
			// react-dom escapes the apostrophe in attributes.
			expect(html).toContain(`aria-label="${PRO_LABEL[pillar]} — ${TOOLTIP.replace("'", '&#x27;')}"`);
		},
	);

	it('binds colour through tokens only', () => {
		expect(render('sync')).not.toMatch(/#[0-9a-f]{3,6}\b/i);
	});
});
