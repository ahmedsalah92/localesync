// src/ui/shell/useModalFocus.test.ts — the pure half of the modal focus trap, and the shared live
// notice line. The DOM half (focusing, restoring) needs a real document and is an in-Figma check.
import { createElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { nextFocusIndex } from './useModalFocus';

describe('nextFocusIndex — Tab wraps inside the dialog', () => {
	it('moves forward and back one control', () => {
		expect(nextFocusIndex(0, 4, false)).toBe(1);
		expect(nextFocusIndex(2, 4, true)).toBe(1);
	});

	it('wraps Tab from the last control to the first', () => {
		expect(nextFocusIndex(3, 4, false)).toBe(0);
	});

	it('wraps Shift-Tab from the first control to the last', () => {
		expect(nextFocusIndex(0, 4, true)).toBe(3);
	});

	it('pulls focus from outside the dialog back to the first (Tab) or last (Shift-Tab) control', () => {
		expect(nextFocusIndex(-1, 4, false)).toBe(0);
		expect(nextFocusIndex(-1, 4, true)).toBe(3);
	});

	it('keeps a single control focused', () => {
		expect(nextFocusIndex(0, 1, false)).toBe(0);
		expect(nextFocusIndex(0, 1, true)).toBe(0);
	});

	it('has nowhere to go with no focusable control', () => {
		expect(nextFocusIndex(-1, 0, false)).toBeNull();
	});
});

describe('ModalNotice', () => {
	let render: (tone: 'danger' | 'warning', text: string) => string = () => '';

	beforeAll(async () => {
		const [{ renderToStaticMarkup }, { ModalNotice }] = await Promise.all([
			import('react-dom/server'),
			import('./ModalNotice'),
		]);
		render = (tone, text) => renderToStaticMarkup(createElement(ModalNotice, { tone, children: text }));
	});

	it('announces itself politely, so a screen reader hears the line when it appears', () => {
		expect(render('danger', 'Broken')).toContain('aria-live="polite"');
		expect(render('warning', 'Careful')).toContain('aria-live="polite"');
	});

	it('colours the line by tone', () => {
		expect(render('danger', 'Broken')).toContain('var(--ls-text-danger)');
		expect(render('warning', 'Careful')).toContain('var(--ls-text-warning)');
	});
});
