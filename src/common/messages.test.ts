// src/common/messages.test.ts — pure unit tests (no `figma`, no DOM).
import { describe, expect, it } from 'vitest';
import { isPluginMessage, mainToUiTypes, uiToMainTypes } from './messages';
import { fixtures } from './messages.fixtures';

// The authoritative Phase-1 type set. Kept independent of messages.ts internals so a drift between
// the union and the fixtures is caught here rather than passing silently.
const UI_TO_MAIN = [
	'scan-request',
	'extraction-request',
	'overflow-scan-request',
	'apply-pseudoloc',
	'revert-pseudoloc',
	'apply-rtl-mirror',
	'revert-rtl-mirror',
	'apply-preview',
	'revert-preview',
	'preview-import',
	'preview-edit',
	'preview-state-request',
	'select-node',
	'overflow-scan-cancel',
	'resize-window',
	'open-waitlist',
	'telemetry-mark',
	'telemetry-state-request',
] as const;
const MAIN_TO_UI = [
	'scan-result',
	'extraction-result',
	'overflow-scan-partial',
	'overflow-scan-result',
	'progress',
	'error',
	'rtl-flagged',
	'preview-state',
	'preview-result',
	'telemetry-state',
] as const;
const ALL_TYPES = [...UI_TO_MAIN, ...MAIN_TO_UI];

describe('isPluginMessage', () => {
	it('accepts every canonical fixture', () => {
		for (const fixture of fixtures) {
			expect(isPluginMessage(fixture), fixture.type).toBe(true);
		}
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['a number', 42],
		['an empty object', {}],
		['a message with no id', { type: 'scan-request' }],
		['a message with no type', { id: 'x' }],
		['an unknown type', { type: 'not-a-real-type', id: 'x' }],
		['a non-string id', { type: 'scan-request', id: 42 }],
	])('rejects %s', (_label, value) => {
		expect(isPluginMessage(value)).toBe(false);
	});
});

describe('fixture coverage', () => {
	it('has exactly one fixture per known message type', () => {
		const covered = new Set(fixtures.map((m) => m.type));
		expect(covered).toEqual(new Set(ALL_TYPES));
		expect(fixtures.length).toBe(ALL_TYPES.length);
	});

	it('gives every fixture a distinct id', () => {
		const ids = new Set(fixtures.map((m) => m.id));
		expect(ids.size).toBe(fixtures.length);
	});
});

// The runtime type lists the dev round-trip driver iterates (LS-31). Read off the exhaustive
// allow-list Records, so they cannot drift from the unions the way the driver's hand-kept arrays did.
describe('message type lists', () => {
	it('lists every UI→main type exactly once', () => {
		expect([...uiToMainTypes()].sort()).toEqual([...UI_TO_MAIN].sort());
	});

	it('lists every main→UI type exactly once, rtl-flagged included', () => {
		expect([...mainToUiTypes()].sort()).toEqual([...MAIN_TO_UI].sort());
	});
});
