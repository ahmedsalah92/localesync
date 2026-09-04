import { describe, expect, it } from 'vitest';
import { toneToken, type RowTone } from './ResultsRow';

describe('toneToken', () => {
	const cases: [RowTone, { strip: string; meta: string }][] = [
		['fits', { strip: '--ls-icon-success', meta: '--ls-text-secondary' }],
		['truncates', { strip: '--ls-icon-warning', meta: '--ls-text-warning' }],
		['overflows', { strip: '--ls-icon-danger', meta: '--ls-text-danger' }],
		['unmeasurable', { strip: '--ls-icon-tertiary', meta: '--ls-text-tertiary' }],
		['neutral', { strip: '--ls-border-neutral', meta: '--ls-text-tertiary' }],
	];

	it.each(cases)('returns the §2.4 token for %s', (tone, expected) => {
		expect(toneToken(tone)).toEqual(expected);
	});
});
