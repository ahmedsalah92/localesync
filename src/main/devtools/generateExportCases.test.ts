// src/main/devtools/generateExportCases.test.ts — pure unit tests (no `figma`, no DOM).
//
// The generator cannot import fixtures/export-cases.json: the main-thread tsconfig has neither
// `resolveJsonModule` nor the fixtures directory in its `include`, and adding either to the
// production build to serve a dev-only module is the wrong trade. So EXPORT_CASES is a hand
// transcription, and this file is what keeps it honest — it diffs the transcription against the
// fixture on every `npm test`, so the canvas Gleef is run over cannot drift from the case set the
// goldens are diffed against (agent-guidelines §6).
import { describe, expect, it } from 'vitest';
import cases from '../../../fixtures/export-cases.json';
import { EXPORT_CASES } from './generateExportCases';

const fixture = cases.entries;

describe('EXPORT_CASES transcribes fixtures/export-cases.json', () => {
	it('carries the same number of cases', () => {
		expect(EXPORT_CASES).toHaveLength(fixture.length);
	});

	it('carries n, key and value identically, in the same order', () => {
		expect(EXPORT_CASES.map((c) => ({ n: c.n, key: c.key, value: c.value }))).toEqual(
			fixture.map((c) => ({ n: c.n, key: c.key, value: c.value })),
		);
	});

	// The invisible-character rows are the whole reason the fixture exists; an equality assertion on
	// whole objects can pass while a reviewer eyeballing the diff sees nothing. These name them.
	it.each([
		{ n: 6, describe: 'a literal backslash-n, two characters', expected: ['\\', 'n'] },
		{ n: 7, describe: 'a real newline', expected: ['\n'] },
		{ n: 8, describe: 'a real tab', expected: ['\t'] },
		{ n: 9, describe: 'U+2028 line separator', expected: [' '] },
		{ n: 30, describe: 'U+0301 combining acute', expected: ['́'] },
	])('#$n contains $describe', ({ n, expected }) => {
		const value = EXPORT_CASES.find((c) => c.n === n)?.value;
		expect(value).toBeDefined();
		for (const char of expected) expect(value).toContain(char);
	});

	it('keeps #29 and #30 distinct but NFC-equal — dedup must not merge them', () => {
		const precomposed = EXPORT_CASES.find((c) => c.n === 29)?.value ?? '';
		const combining = EXPORT_CASES.find((c) => c.n === 30)?.value ?? '';
		expect(precomposed).not.toBe(combining);
		expect(precomposed.normalize('NFC')).toBe(combining.normalize('NFC'));
	});

	it('keeps #36 out of the dedup group by one trailing space', () => {
		const group = EXPORT_CASES.filter((c) => c.value === 'Save');
		expect(group.map((c) => c.key)).toEqual(['settings.save', 'profile.save', 'editor.save']);
		expect(EXPORT_CASES.find((c) => c.n === 36)?.value).toBe('Save ');
	});
});

describe('the shape generateExportCases depends on', () => {
	it('numbers cases 1..N in order', () => {
		expect(EXPORT_CASES.map((c) => c.n)).toEqual(EXPORT_CASES.map((_, index) => index + 1));
	});

	it('has no duplicate keys — each one becomes a distinct canvas path', () => {
		const keys = EXPORT_CASES.map((c) => c.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	// pathOf throws without one: the leaf names the text layer, so a single-segment key would have
	// no frame to sit in and would land at page level, outside the `export-cases` group.
	it('gives every key at least one frame segment', () => {
		for (const c of EXPORT_CASES) expect(c.key.split('.').length).toBeGreaterThanOrEqual(2);
	});

	it('puts a leaf and a branch at the same path — the collision Gleef must answer', () => {
		expect(EXPORT_CASES.some((c) => c.key === 'home.title')).toBe(true);
		expect(EXPORT_CASES.some((c) => c.key === 'home.title.sub')).toBe(true);
	});

	it('collides two distinct keys under Android dot-to-underscore remapping', () => {
		const remapped = EXPORT_CASES.map((c) => c.key.replace(/\./g, '_'));
		const collisions = remapped.filter((name, index) => remapped.indexOf(name) !== index);
		expect(collisions).toEqual(['nav_item_2']);
	});
});
