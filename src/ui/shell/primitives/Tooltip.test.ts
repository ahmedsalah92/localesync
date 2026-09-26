// src/ui/shell/primitives/Tooltip.test.ts — placement (LS-13 final review). Pure.
import { describe, expect, it } from 'vitest';
import { tooltipPlacement } from './Tooltip';

describe('tooltipPlacement', () => {
	it('keeps the default below the anchor', () => {
		expect(tooltipPlacement('bottom')).toEqual({ top: '100%', marginTop: 'var(--spacer-1)' });
	});

	// A footer band is the last thing in a 100vh overflow:hidden column: below it is off-screen.
	it('opens above the anchor for a footer band', () => {
		expect(tooltipPlacement('top')).toEqual({ bottom: '100%', marginBottom: 'var(--spacer-1)' });
	});
});
