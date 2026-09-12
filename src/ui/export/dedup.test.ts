// src/ui/export/dedup.test.ts — LS-6 §2.4.
import { describe, expect, it } from 'vitest';
import type { ExtractedString } from '../../common/models';
import { occurrenceCounts } from '../extract/state';
import { applyDedup } from './dedup';

const entry = (key: string, value: string, nodeId = key): ExtractedString => ({
	key,
	nodeId,
	value,
	drifted: false,
});

describe('applyDedup', () => {
	it('keeps the first occurrence in document order and collapses the rest', () => {
		const { entries, keyMap } = applyDedup([
			entry('settings.save', 'Save'),
			entry('profile.save', 'Save'),
			entry('editor.save', 'Save'),
		]);
		expect(entries.map((e) => e.key)).toEqual(['settings.save']);
		expect(keyMap.map((m) => [m.from, m.to])).toEqual([
			['profile.save', 'settings.save'],
			['editor.save', 'settings.save'],
		]);
		expect(keyMap.every((m) => m.reason === 'dedup')).toBe(true);
	});

	it('is order-dependent by design — reversing the input changes the survivor', () => {
		const forward = applyDedup([entry('a.one', 'Save'), entry('b.two', 'Save')]);
		const reversed = applyDedup([entry('b.two', 'Save'), entry('a.one', 'Save')]);
		expect(forward.entries[0]?.key).toBe('a.one');
		expect(reversed.entries[0]?.key).toBe('b.two');
	});

	it('does not merge values differing only by a trailing space', () => {
		const { entries } = applyDedup([entry('a.save', 'Save'), entry('b.save', 'Save ')]);
		expect(entries).toHaveLength(2);
	});

	// The case Unicode normalisation would silently break: identical on screen, different strings.
	it('does not merge precomposed and decomposed forms of the same word', () => {
		const precomposed = entry('a.cafe', 'Café');
		const combining = entry('b.cafe', 'Café');
		expect(precomposed.value).not.toBe(combining.value);
		expect(precomposed.value.normalize('NFC')).toBe(combining.value.normalize('NFC'));
		expect(applyDedup([precomposed, combining]).entries).toHaveLength(2);
	});

	it('leaves a set with no duplicates untouched and produces no keyMap', () => {
		const input = [entry('a.one', 'One'), entry('b.two', 'Two')];
		const { entries, keyMap } = applyDedup(input);
		expect(entries).toEqual(input);
		expect(keyMap).toEqual([]);
	});

	/**
	 * §2.4.18 ties dedup to the `N×` row marker: the marker must predict what dedup collapses, or the
	 * UI promises something the export does not do. This asserts the two agree rather than trusting
	 * that both were written from the same sentence.
	 */
	it('collapses exactly the groups occurrenceCounts marks as duplicated', () => {
		const input = [
			entry('a.save', 'Save'),
			entry('b.save', 'Save'),
			entry('c.unique', 'Unique'),
			entry('d.save', 'Save '),
		];
		const counts = occurrenceCounts(input);
		const markedDuplicate = input.filter((e) => (counts.get(e.nodeId) ?? 1) > 1);
		const { keyMap } = applyDedup(input);
		// Every collapsed key was marked; the survivor is marked too but is not collapsed.
		expect(markedDuplicate.map((e) => e.key)).toEqual(['a.save', 'b.save']);
		expect(keyMap.map((m) => m.from)).toEqual(['b.save']);
	});
});
