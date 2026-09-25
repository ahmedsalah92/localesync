// src/main/rtl/scope.test.ts — pure unit tests (no `figma`, no DOM).
import { describe, expect, it } from 'vitest';
import { resolveMirrorScope } from './scope';

describe('resolveMirrorScope — scope is explicit (ruleset §7.3, LS-33)', () => {
	it('mirrors the page when Page is chosen, whatever is selected', () => {
		expect(resolveMirrorScope('page', 0)).toBe('page');
		expect(resolveMirrorScope('page', 3)).toBe('page');
	});

	it('mirrors the selection when Selection is chosen and something is selected', () => {
		expect(resolveMirrorScope('selection', 1)).toBe('selection');
	});

	// The regression: this fell back to the whole page, restructuring layout the user had
	// explicitly scoped out. Selection with nothing selected mirrors nothing.
	it('refuses, rather than falling back to the page, when nothing is selected', () => {
		expect(resolveMirrorScope('selection', 0)).toBe('no-selection');
	});
});
