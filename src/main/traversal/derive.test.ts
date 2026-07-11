// src/main/traversal/derive.test.ts — pure unit tests (no `figma`, no DOM). Imports the pure
// derivation seams only; ./index would pull in the bridge, whose module scope assigns
// figma.ui.onmessage and cannot load under Vitest.
import { describe, expect, it } from 'vitest';
import { deriveContainerLabel, deriveFontInfo, resolveEffectiveFlags, toScannedTextNode } from './derive';
import type { TextNodeModel } from './model';

const inter = { family: 'Inter', style: 'Regular' };
const interBold = { family: 'Inter', style: 'Bold' };

function makeModel(overrides: Partial<TextNodeModel> = {}): TextNodeModel {
	return {
		nodeId: '1:2',
		characters: 'auto-width',
		textAutoResize: 'WIDTH_AND_HEIGHT',
		textTruncation: 'ENDING',
		maxLines: 2,
		maxHeight: 80,
		ownBounds: { x: 0, y: 0, width: 120, height: 24 },
		containerBounds: { x: -10, y: -10, width: 400, height: 300 },
		parentClipsContent: true,
		rotation: 30,
		containerLabel: 'home / header',
		fonts: [inter],
		isMixedFont: false,
		hasMissingFont: false,
		inInstance: true,
		locked: false,
		hidden: true,
		empty: false,
		...overrides,
	};
}

describe('toScannedTextNode', () => {
	it('projects to exactly the nine DTO fields and drops every main-side field', () => {
		// toEqual is strict about extra keys, so this asserts the projection AND that no
		// main-side field (bounds, fonts, resize/truncation, rotation) leaks onto the wire.
		expect(toScannedTextNode(makeModel())).toEqual({
			nodeId: '1:2',
			characters: 'auto-width',
			containerLabel: 'home / header',
			hasMissingFont: false,
			isMixedFont: false,
			inInstance: true,
			locked: false,
			hidden: true,
			empty: false,
		});
	});

	it('copies flag values rather than defaulting them', () => {
		const dto = toScannedTextNode(
			makeModel({ hasMissingFont: true, isMixedFont: true, hidden: false, empty: true }),
		);
		expect(dto.hasMissingFont).toBe(true);
		expect(dto.isMixedFont).toBe(true);
		expect(dto.hidden).toBe(false);
		expect(dto.empty).toBe(true);
	});
});

describe('deriveContainerLabel', () => {
	it.each([
		[[], ''],
		[['home'], 'home'],
		[['header', 'home'], 'home / header'],
		[['cta', 'header', 'home'], 'home / header / cta'],
		// depth cap 3 — the nearest three win; the outermost 'home' falls off.
		[['deep', 'cta', 'header', 'home'], 'header / cta / deep'],
	])('joins nearest-first %j outermost-first with " / "', (names, expected) => {
		expect(deriveContainerLabel(names)).toBe(expected);
	});
});

describe('resolveEffectiveFlags', () => {
	const chain = (...flags: [locked: boolean, visible: boolean][]) =>
		flags.map(([locked, visible]) => ({ locked, visible }));

	it('stays false/false for a visible, unlocked node under a plain chain', () => {
		expect(resolveEffectiveFlags(false, true, chain([false, true], [false, true]))).toEqual({
			locked: false,
			hidden: false,
		});
	});

	it('marks a self-visible node under an invisible ancestor as hidden', () => {
		expect(resolveEffectiveFlags(false, true, chain([false, true], [false, false]))).toEqual({
			locked: false,
			hidden: true,
		});
	});

	it('marks a self-unlocked node under a locked ancestor as locked', () => {
		expect(resolveEffectiveFlags(false, true, chain([true, true]))).toEqual({ locked: true, hidden: false });
	});

	it('honors self flags with no ancestors at all', () => {
		expect(resolveEffectiveFlags(true, false, [])).toEqual({ locked: true, hidden: true });
	});
});

describe('deriveFontInfo (classification)', () => {
	const mixed = Symbol('figma.mixed');

	it("classifies '' as empty with no fonts", () => {
		expect(deriveFontInfo(inter, mixed, '', () => [inter])).toEqual({ fonts: [], isMixedFont: false, empty: true });
	});

	it('flags the mixed sentinel and collects the range fonts', () => {
		expect(deriveFontInfo(mixed, mixed, 'ab', () => [inter, interBold])).toEqual({
			fonts: [inter, interBold],
			isMixedFont: true,
			empty: false,
		});
	});

	it('wraps a single font without calling the range reader', () => {
		const info = deriveFontInfo(inter, mixed, 'ab', () => {
			throw new Error('rangeFonts must not be called for a single-font node');
		});
		expect(info).toEqual({ fonts: [inter], isMixedFont: false, empty: false });
	});
});
