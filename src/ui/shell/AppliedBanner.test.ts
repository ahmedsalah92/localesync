// src/ui/shell/AppliedBanner.test.ts — stacked rows, one Revert each (LS-34). react-dom/server.
import { createElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppliedFeature, AppliedState } from './applied';

let render: (initial: Partial<Record<AppliedFeature, AppliedState | null>>) => string = () => '';

beforeAll(async () => {
	const [{ renderToStaticMarkup }, { AppliedProvider }, { AppliedBanner }] = await Promise.all([
		import('react-dom/server'),
		import('./applied'),
		import('./AppliedBanner'),
	]);
	render = (initial) =>
		renderToStaticMarkup(createElement(AppliedProvider, { initial, children: createElement(AppliedBanner) }));
});

const on = (message: string): AppliedState => ({ kind: 'applied', message, onRevert: () => {} });

describe('AppliedBanner', () => {
	it('renders nothing when nothing is applied', () => {
		expect(render({})).toBe('');
	});

	it('renders one row per applied feature, in tab order, each with its own Revert', () => {
		const html = render({ pseudo: on('Pseudo-loc applied'), preview: on('Preview: German (de)') });
		expect(html.indexOf('Preview: German (de)')).toBeLessThan(html.indexOf('Pseudo-loc applied'));
		expect(html.match(/>Revert</g)).toHaveLength(2);
	});

	it('renders no Revert for a restored entry', () => {
		const html = render({ rtl: { kind: 'restored', message: 'Restored your canvas.' } });
		expect(html).toContain('Restored your canvas.');
		expect(html).not.toContain('>Revert<');
	});
});
