// src/main/overflow/verdict.test.ts — pure unit tests (no `figma`, no DOM).
import { describe, expect, it } from 'vitest';
import { severityFor } from './verdict';

describe('severityFor', () => {
	// Exhaustive over all four OverflowVerdictValue members (LS-8 §2 table).
	it.each([
		['overflows', 'error'],
		['truncates', 'warn'],
		['unmeasurable', 'warn'],
		['fits', undefined],
	] as const)('%s → %s', (verdict, severity) => {
		expect(severityFor(verdict)).toBe(severity);
	});
});
