import { describe, expect, it } from 'vitest';
import { clampWindowSize, isWindowSize } from './shell';

describe('clampWindowSize', () => {
	it.each([
		[
			{ width: 400, height: 680 },
			{ width: 400, height: 680 },
		],
		[
			{ width: 340, height: 440 },
			{ width: 340, height: 440 },
		],
		[
			{ width: 100, height: 680 },
			{ width: 340, height: 680 },
		],
		[
			{ width: 400, height: 100 },
			{ width: 400, height: 440 },
		],
		[
			{ width: 100, height: 100 },
			{ width: 340, height: 440 },
		],
		[
			{ width: 412.4, height: 680.6 },
			{ width: 412, height: 681 },
		],
		[
			{ width: 339.6, height: 439.6 },
			{ width: 340, height: 440 },
		],
		[
			{ width: 2000, height: 1400 },
			{ width: 2000, height: 1400 },
		],
		[
			{ width: Number.NaN, height: 680 },
			{ width: 400, height: 680 },
		],
		[
			{ width: 400, height: Number.POSITIVE_INFINITY },
			{ width: 400, height: 680 },
		],
	])('clamps %o to %o', (input, expected) => {
		expect(clampWindowSize(input)).toEqual(expected);
	});
});

describe('isWindowSize', () => {
	it('accepts a finite width and height', () => {
		expect(isWindowSize({ width: 400, height: 680 })).toBe(true);
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['a number', 42],
		['an empty object', {}],
		['a missing height', { width: 400 }],
		['a string width', { width: '400', height: 680 }],
		['a NaN width', { width: Number.NaN, height: 680 }],
		['an infinite width', { width: Number.POSITIVE_INFINITY, height: 680 }],
	])('rejects %s', (_label, value) => {
		expect(isWindowSize(value)).toBe(false);
	});
});
