import { describe, expect, it } from 'vitest';
import { SCANNING_START, VERDICT_WORD, rowMeta, scanningCount } from './copy';
import type { OverflowVerdict } from '../../common/models';

function verdict(over: Partial<OverflowVerdict> = {}): OverflowVerdict {
	return {
		nodeId: '1:2',
		language: 'de',
		verdict: 'overflows',
		characters: 'Save',
		containerLabel: 'Button',
		candidate: 'Speichern',
		measuredWidth: 60,
		measuredHeight: 38,
		overflowPx: 30,
		...over,
	};
}

describe('rowMeta — the verdict and delta must survive any container path', () => {
	it('splits the label from the verdict chunk rather than concatenating', () => {
		expect(rowMeta(verdict())).toEqual({ label: 'Button', verdict: '•  overflows 30px' });
	});

	// The regression this split exists for: the label is the only part allowed to grow without
	// bound, so it must be the only part that can ever be ellipsed.
	it('keeps the verdict chunk short and self-contained under a deep path', () => {
		const deep = 'Section — Plugin Header / Figma host chrome — not part of the plugin surface';
		const meta = rowMeta(
			verdict({
				containerLabel: deep,
				verdict: 'unmeasurable',
				reason: 'no-bounds',
				overflowPx: undefined,
			}),
		);
		expect(meta.label).toBe(deep);
		expect(meta.verdict).toBe('•  no bounds');
		expect(meta.tooltip).toBe("No rendered box, so there's nothing to measure against.");
	});

	it.each([
		['missing-font', 'font missing', "Font not installed, so Figma can't re-flow this text."],
		['mixed-font-missing', 'font missing', "One of this layer's fonts isn't installed."],
		['no-bounds', 'no bounds', "No rendered box, so there's nothing to measure against."],
		[
			'unsupported-language',
			'not supported yet',
			"This language needs glyph-width modelling, which isn't built yet.",
		],
		['empty', 'empty', 'This layer has no text.'],
	] as const)('surfaces the %s reason as a word and tooltip', (reason, word, tooltip) => {
		expect(rowMeta(verdict({ verdict: 'unmeasurable', reason, overflowPx: undefined }))).toEqual({
			label: 'Button',
			verdict: `•  ${word}`,
			tooltip,
		});
	});

	it('falls back to un-measurable when the optional reason is absent', () => {
		const meta = rowMeta(verdict({ verdict: 'unmeasurable', reason: undefined, overflowPx: undefined }));
		expect(meta.verdict).toBe('•  un-measurable');
		expect(meta).not.toHaveProperty('tooltip');
	});

	it('does not add a tooltip to a measurable verdict', () => {
		const meta = rowMeta(verdict());
		expect(meta).not.toHaveProperty('tooltip');
	});

	it('ceils the delta so a sub-pixel overshoot never reports 0px', () => {
		expect(rowMeta(verdict({ overflowPx: 0.4 })).verdict).toBe('•  overflows 1px');
	});

	it('omits the amount where none is derivable', () => {
		expect(rowMeta(verdict({ verdict: 'fits', overflowPx: undefined })).verdict).toBe('•  fits');
	});

	it('uses the settled copy word, not the union member', () => {
		expect(rowMeta(verdict({ verdict: 'truncates', overflowPx: 8 })).verdict).toBe('•  clips 8px');
		expect(VERDICT_WORD.truncates).toBe('clips');
	});
});

describe('scanning band copy', () => {
	// The pre-`total` label must not format a count it does not have: `Scanning… 0 of 0 nodes`
	// asserted an empty page while claiming to scan it.
	it('states no numbers before total is known', () => {
		expect(SCANNING_START).toBe('Scanning…');
		expect(/\d/.test(SCANNING_START)).toBe(false);
	});

	it('formats thousands once total is known', () => {
		expect(scanningCount(1284, 3410)).toBe('Scanning… 1,284 of 3,410 nodes');
	});
});
