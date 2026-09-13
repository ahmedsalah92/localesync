// src/common/pseudoloc.test.ts — pure unit tests (no `figma`, no DOM).
//
// The transform's own tests, moved here with the transform itself when LS-10 needed the UI to run
// it (see the module header). The measurement model's tests stay in
// src/main/overflow/expand.test.ts, including the no-regression guard that pins
// `expandForLanguage` output against this rewrite.
import { describe, expect, it } from 'vitest';
import cases from '../../fixtures/pseudoloc-cases.json';
import { transform } from './pseudoloc';
import type { PseudoLocOptions } from './models';

/** LS-10 §2.1 defaults, as built on canvas: +40%, full accents, double markers. */
const DEFAULTS: PseudoLocOptions = { expansionPct: 40, accent: 'full', markers: 'double' };

describe('transform — LS-10 §3.2 case table', () => {
	it('transcribes all thirteen rows', () => {
		expect(cases.cases).toHaveLength(13);
	});

	it.each(cases.cases)('#$n $exercises', (row) => {
		expect(transform(row.source, { ...DEFAULTS, ...(row.opts ?? {}) } as PseudoLocOptions)).toBe(row.expected);
	});
});

describe('transform — the rules behind the table', () => {
	it('leaves every placeholder byte-identical', () => {
		for (const token of ['{{count}}', '{{ name }}', '{0}', '{12}', '%@', '%s', '%1$s', '%12$s']) {
			expect(transform(`Value ${token} here`, DEFAULTS)).toContain(token);
		}
	});

	it('does not treat a bare % as a placeholder — it stays literal padding material', () => {
		// If `%` alone were a token, `50%` would be protected and the material would shrink to
		// ["got","off"], changing the padding. #11 pins the output; this names the reason.
		expect(transform('%1$s got 50% off', DEFAULTS)).toContain('50%');
		expect(transform('50% off', { ...DEFAULTS, accent: 'none', markers: 'none' })).toBe('50% off50%');
	});

	it('accents nothing under `none`, and `full` is a superset of `partial`', () => {
		const plain = { ...DEFAULTS, markers: 'none' as const, expansionPct: 0 };
		expect(transform('canyon', { ...plain, accent: 'none' })).toBe('canyon');
		expect(transform('canyon', { ...plain, accent: 'partial' })).toBe('cányón');
		expect(transform('canyon', { ...plain, accent: 'full' })).toBe('çáñýóñ');
	});

	it('never changes length by accenting — replacements are single code points', () => {
		const plain = { ...DEFAULTS, markers: 'none' as const, expansionPct: 0 };
		for (const style of ['none', 'partial', 'full'] as const) {
			expect(transform('canyon', { ...plain, accent: style })).toHaveLength(6);
		}
	});

	it('applies each marker style', () => {
		const plain = { ...DEFAULTS, accent: 'none' as const, expansionPct: 0 };
		expect(transform('Save', { ...plain, markers: 'none' })).toBe('Save');
		expect(transform('Save', { ...plain, markers: 'single' })).toBe('[Save]');
		expect(transform('Save', { ...plain, markers: 'double' })).toBe('[[ Save ]]');
	});

	it('leaves no double space inside the markers on the phrase path (§2.11a)', () => {
		// The padding run is sliced to an exact deficit, which can land on a prepended space.
		for (const source of ['You have {{count}} items', 'Password must be at least 8 characters', 'one two three']) {
			expect(transform(source, DEFAULTS)).not.toMatch(/\s{2}/);
		}
	});

	it('clamps a negative expansion rather than shrinking', () => {
		expect(transform('Save', { ...DEFAULTS, expansionPct: -50, accent: 'none', markers: 'none' })).toBe('Save');
	});

	it('is deterministic across every option combination', () => {
		for (const accent of ['none', 'partial', 'full'] as const) {
			for (const markers of ['none', 'single', 'double'] as const) {
				const opts = { expansionPct: 40, accent, markers };
				expect(transform('You have {{count}} items', opts)).toBe(transform('You have {{count}} items', opts));
			}
		}
	});
});
