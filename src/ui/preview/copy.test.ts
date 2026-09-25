// src/ui/preview/copy.test.ts — Preview copy (LS-12 §2.1–§2.5).
import { describe, expect, it } from 'vitest';
import {
	STATES,
	appliedMessage,
	fallbackVerdict,
	replaceNotice,
	skippedGroup,
	summaryCount,
	unmatchedGroup,
} from './copy';

describe('Preview copy', () => {
	it('names the language the way the design does', () => {
		expect(appliedMessage('fr-FR')).toBe('Preview: French (fr-FR)');
		expect(fallbackVerdict('fr-FR')).toBe('•  fallback — no French translation');
	});

	it('counts translated rows', () => {
		expect(summaryCount(5, 7)).toBe('5 of 7 translated');
	});

	it('pluralises the groups', () => {
		expect(unmatchedGroup(1)).toBe('1 key matched no layer');
		expect(unmatchedGroup(3)).toBe('3 keys matched no layer');
		expect(skippedGroup(1)).toBe('1 layer skipped');
		expect(skippedGroup(2)).toBe('2 layers skipped');
	});

	it('uses the copy table verbatim for the states it defines', () => {
		expect(STATES.noKeys.body).toBe(
			'Extract strings first, then choose a language to preview translations in place.',
		);
		expect(STATES.noText).toEqual({
			headline: 'No text layers here',
			body: 'This page has nothing to preview. Try another page.',
		});
		expect(STATES.operationFailed.body).toBe(
			'The preview failed and your canvas was restored. Nothing was left changed.',
		);
	});

	it("asks before replacing a stored language, in the spec's words (§2.1.6)", () => {
		expect(replaceNotice(['fr-FR'])).toBe(
			'French (fr-FR) is already imported. Importing it again replaces it, including your edits.',
		);
		expect(replaceNotice(['de', 'fr-FR'])).toBe(
			'German (de), French (fr-FR) are already imported. Importing them again replaces them, including your edits.',
		);
	});
});
