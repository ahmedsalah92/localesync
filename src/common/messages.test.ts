// src/common/messages.test.ts — pure unit tests (no `figma`, no DOM).
import { describe, expect, it } from 'vitest';
import { isPluginMessage } from './messages';
import { fixtures } from './messages.fixtures';

// The authoritative Phase-1 type set. Kept independent of messages.ts internals so a drift between
// the union and the fixtures is caught here rather than passing silently.
const ALL_TYPES = [
	'scan-request',
	'extraction-request',
	'overflow-scan-request',
	'apply-pseudoloc',
	'revert-pseudoloc',
	'apply-rtl-mirror',
	'revert-rtl-mirror',
	'apply-preview',
	'revert-preview',
	'scan-result',
	'extraction-result',
	'overflow-scan-result',
	'progress',
	'error',
] as const;

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
