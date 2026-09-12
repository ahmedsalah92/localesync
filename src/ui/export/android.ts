// src/ui/export/android.ts — Android `strings.xml` (docs/specs/LS-6.md §2.2).
//
// This is the format where LocaleSync deliberately does NOT match Gleef. Gleef's Android output
// parses as XML but is not a buildable Android resource file: every resource name carries dots,
// apostrophes and leading @/? are left raw, and a trailing space survives unquoted only to be
// trimmed at build time. Each divergence below is listed in §2.2 with its reason.
import type { ExtractedString } from '../../common/models';
import type { KeyMapEntry } from './types';

/** Android resource names must match this or aapt2 cannot generate an `R.string.*` identifier. */
const VALID_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * §2.2.11–12. Dots remap to underscores — LS-9 rule 2 anticipates this, keeping underscore inside
 * the Android safe set so segments themselves need no further remapping. A name that would not
 * start with a letter takes a `key_` prefix rather than being truncated, which would collide.
 */
export function androidName(key: string): string {
	const remapped = key.replace(/\./g, '_');
	return VALID_NAME.test(remapped) ? remapped : `key_${remapped}`;
}

/**
 * §2.2.7–9b, applied in the normative §2.2.8a order: XML entities → backslash → quotes →
 * newline/tab → leading `@`/`?` → quote-wrap.
 *
 * **The backslash rule and its position are load-bearing.** Android runs its own escape pass after
 * XML parsing, so an unescaped backslash starts an escape sequence: `C:\Users\name` comes back as
 * `C:\Users` + a newline + `ame`. Escaping it before the rules that introduce backslashes — and
 * after the XML entities, which introduce none — is what makes the rest safe. The golden round-trip
 * caught this; review did not.
 */
export function escapeAndroid(value: string): string {
	let out = value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		// Android collapses runs of whitespace inside an unquoted value, so a raw newline or tab does
		// not survive the build (§2.2.9a). U+2028 is not ASCII whitespace and stays literal (§2.2.9b).
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t');

	if (/^[@?]/.test(value)) out = `\\${out}`;
	// Android trims unquoted values; quoting is what preserves edge whitespace (§2.2.9).
	if (value !== '' && value !== value.trim()) out = `"${out}"`;
	return out;
}

/**
 * §2.2.13 — `keyMap` records **remapping collisions only**. LS-9's carry-forward is explicit that
 * under the `dot` scheme every key remaps, so a fully-populated map traces nothing. The first key in
 * document order keeps the remapped name; later ones take `_2`, `_3`, and only those are recorded.
 */
function assignNames(entries: readonly ExtractedString[]): { names: string[]; keyMap: KeyMapEntry[] } {
	const taken = new Set<string>();
	const names: string[] = [];
	const keyMap: KeyMapEntry[] = [];

	for (const entry of entries) {
		const base = androidName(entry.key);
		if (!taken.has(base)) {
			taken.add(base);
			names.push(base);
			continue;
		}
		let suffix = 2;
		let candidate = `${base}_${suffix}`;
		while (taken.has(candidate)) candidate = `${base}_${++suffix}`;
		taken.add(candidate);
		names.push(candidate);
		keyMap.push({ nodeId: entry.nodeId, from: entry.key, to: candidate, reason: 'android-remap-collision' });
	}

	return { names, keyMap };
}

/**
 * §2.2.10a. aapt2 rejects a value carrying two or more `%` — *"multiple substitutions specified in
 * non-positional format"* — and refuses to compile the whole file. `formatted="false"` switches its
 * format validation off for that one string.
 *
 * This is an attribute, not a content change: the value stays byte-identical, so aapt2 compatibility
 * costs nothing against preserve-not-generate. A single `%`, positional or not, compiles fine and
 * takes no attribute.
 */
function needsFormattedFalse(value: string): boolean {
	return (value.match(/%/g) ?? []).length >= 2;
}

/** §2.2.6: XML declaration, `<resources>` root, 2-space indent, no BOM, no trailing newline. */
export function serializeAndroid(entries: readonly ExtractedString[]): {
	content: string;
	keyMap: KeyMapEntry[];
} {
	const { names, keyMap } = assignNames(entries);
	const lines = entries.map((entry, index) => {
		const name = names[index] ?? androidName(entry.key);
		const attributes = needsFormattedFalse(entry.value) ? ' formatted="false"' : '';
		return `  <string name="${name}"${attributes}>${escapeAndroid(entry.value)}</string>`;
	});
	return {
		content: `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${lines.join('\n')}\n</resources>`,
		keyMap,
	};
}
