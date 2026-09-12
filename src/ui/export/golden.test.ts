// src/ui/export/golden.test.ts — byte-for-byte diff against fixtures/expected/ (LS-6 §3.3).
//
// This is the test the whole fixture apparatus exists for. The goldens derive from LS-6 §2's
// resolved rules, never hand-typed independently (agent-guidelines §6), and were verified against
// real parsers: JSON.parse, fast-xml-parser plus an Android unescaping round-trip, and `plutil`
// for the iOS file. Where Gleef is authoritative — XML entity escaping — they match its output.
//
// Byte equality, not structural: §2.6.26 requires reproducible bytes, and a structural comparison
// would pass while indentation, entry order or a trailing newline drifted.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import cases from '../../../fixtures/export-cases.json';
import type { ExtractedString } from '../../common/models';
import { serialize } from './index';
import type { ExportFormat } from './types';

const EXPECTED = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/expected');

/** `drifted` is not an export input (§1.1); the fixture carries the three fields that are. */
const entries: ExtractedString[] = cases.entries.map((entry) => ({
	key: entry.key,
	nodeId: entry.nodeId,
	value: entry.value,
	drifted: false,
}));

const golden = (name: string) => readFileSync(join(EXPECTED, name), 'utf8');

describe.each([
	{ format: 'json' as ExportFormat, file: 'translations.json' },
	{ format: 'ios' as ExportFormat, file: 'Localizable.strings' },
	{ format: 'android' as ExportFormat, file: 'strings.xml' },
])('$format matches fixtures/expected/$file byte for byte', ({ format, file }) => {
	it('serializes to the golden', () => {
		expect(serialize(entries, { format, dedup: false }).content).toBe(golden(file));
	});

	it('names the file the golden is named after', () => {
		expect(serialize(entries, { format, dedup: false }).filename).toBe(file);
	});

	it('emits no BOM and no trailing newline', () => {
		const { content } = serialize(entries, { format, dedup: false });
		expect(content.charCodeAt(0)).not.toBe(0xfeff);
		expect(content.endsWith('\n')).toBe(false);
	});

	it('is reproducible — the same input twice gives identical bytes', () => {
		expect(serialize(entries, { format, dedup: false }).content).toBe(
			serialize(entries, { format, dedup: false }).content,
		);
	});
});

describe('what the goldens encode about the two not-verbatim outcomes', () => {
	it('JSON omits exactly the one prefix collision, and reports it', () => {
		const { omitted } = serialize(entries, { format: 'json', dedup: false });
		expect(omitted).toEqual([{ nodeId: '1:10', key: 'home.title', reason: 'json-prefix-collision' }]);
	});

	it('Android remaps exactly the one name collision, and reports it', () => {
		const { keyMap } = serialize(entries, { format: 'android', dedup: false });
		expect(keyMap).toEqual([
			{ nodeId: '1:48', from: 'nav.item.2', to: 'nav_item_2_2', reason: 'android-remap-collision' },
		]);
	});

	it('iOS carries every key verbatim — no remapping, nothing omitted', () => {
		const result = serialize(entries, { format: 'ios', dedup: false });
		expect(result.keyMap).toEqual([]);
		expect(result.omitted).toEqual([]);
		for (const entry of entries) expect(result.content).toContain(`"${entry.key}" = `);
	});
});
