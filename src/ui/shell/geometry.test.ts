import { describe, expect, it } from 'vitest';
import { rowsHeight } from './geometry';

describe('rowsHeight', () => {
	it('returns 520 with a footer and no banner', () => {
		expect(rowsHeight(true, false)).toBe(520);
	});

	it('returns 560 with no footer and no banner', () => {
		expect(rowsHeight(false, false)).toBe(560);
	});

	it('returns 480 with a footer and a banner', () => {
		expect(rowsHeight(true, true)).toBe(480);
	});

	// 520 also comes out of (footer, no banner) above — same number, different args. Assert this
	// one against its own arguments rather than trusting the literal alone.
	it('returns 520 with no footer and a banner', () => {
		expect(rowsHeight(false, true)).toBe(520);
	});
});
