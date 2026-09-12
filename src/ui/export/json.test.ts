// src/ui/export/json.test.ts — LS-6 §2.1.
import { describe, expect, it } from 'vitest';
import type { ExtractedString } from '../../common/models';
import { serializeJson } from './json';

const entry = (key: string, value: string, nodeId = key): ExtractedString => ({
	key,
	nodeId,
	value,
	drifted: false,
});

describe('serializeJson', () => {
	it('nests on the dot separator, matching i18next\u2019s default keySeparator', () => {
		const { content } = serializeJson([entry('checkout.summary.total', '$42.00')]);
		expect(JSON.parse(content)).toEqual({ checkout: { summary: { total: '$42.00' } } });
	});

	it('indents with two spaces and adds no trailing newline', () => {
		const { content } = serializeJson([entry('a.b', 'x')]);
		expect(content).toBe('{\n  "a": {\n    "b": "x"\n  }\n}');
	});

	it('keeps non-ASCII literal rather than escaping it to \\u sequences', () => {
		const { content } = serializeJson([entry('a.ar', 'مرحبا'), entry('a.emoji', '🎉')]);
		expect(content).toContain('مرحبا');
		expect(content).toContain('🎉');
		expect(content).not.toContain('\\u');
	});

	it('escapes quotes, backslashes and control characters', () => {
		const { content } = serializeJson([entry('a.q', 'He said "hi"'), entry('a.p', 'C:\\Users')]);
		const parsed: Record<string, Record<string, string>> = JSON.parse(content);
		expect(parsed.a?.q).toBe('He said "hi"');
		expect(parsed.a?.p).toBe('C:\\Users');
	});
});

describe('prefix collisions (§2.1.2)', () => {
	const input = [entry('home.title', 'Welcome back', '1:1'), entry('home.title.sub', 'Good to see you', '1:2')];

	it('lets the branch win and omits the leaf', () => {
		const { content } = serializeJson(input);
		expect(JSON.parse(content)).toEqual({ home: { title: { sub: 'Good to see you' } } });
	});

	it('reports the omitted key rather than dropping it silently', () => {
		expect(serializeJson(input).omitted).toEqual([
			{ nodeId: '1:1', key: 'home.title', reason: 'json-prefix-collision' },
		]);
	});

	// Last-writer-wins was rejected precisely because it is order-dependent; this pins that.
	it('resolves the same way regardless of input order', () => {
		const forward = serializeJson(input);
		const reversed = serializeJson([...input].reverse());
		expect(JSON.parse(reversed.content)).toEqual(JSON.parse(forward.content));
		expect(reversed.omitted).toEqual(forward.omitted);
	});

	it('omits a key that is a prefix of several others exactly once', () => {
		const { omitted } = serializeJson([
			entry('a.b', 'leaf', '1:1'),
			entry('a.b.c', 'one', '1:2'),
			entry('a.b.d', 'two', '1:3'),
		]);
		expect(omitted.map((o) => o.key)).toEqual(['a.b']);
	});

	it('leaves a set with no collisions fully intact', () => {
		const { content, omitted } = serializeJson([entry('a.one', '1'), entry('a.two', '2')]);
		expect(omitted).toEqual([]);
		expect(JSON.parse(content)).toEqual({ a: { one: '1', two: '2' } });
	});
});
