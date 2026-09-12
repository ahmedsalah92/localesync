// src/ui/export/ios.ts — iOS `.strings` (docs/specs/LS-6.md §2.3).
import type { ExtractedString } from '../../common/models';

/**
 * §2.3.15. Backslash first, or the backslashes the later rules introduce get escaped a second time
 * and reach the file as literal text.
 *
 * Every rule here was verified against Apple's own parser (`plutil -lint` plus a
 * `plutil -convert json` round-trip, 2026-09-12) rather than derived from documentation alone —
 * §2.3 records the full list. That makes iOS the best-evidenced of the three formats despite being
 * the one with no Gleef export behind it.
 */
export function escapeIos(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t');
}

/**
 * One `"key" = "value";` per line. LS-9 keys are used **verbatim** — dots are legal in `.strings`
 * keys, so unlike Android there is no remapping and no `keyMap` (§2.3.14).
 *
 * UTF-8, no BOM, LF, no trailing newline (§2.3.16–17). No comments and no header, matching the
 * other two formats.
 */
export function serializeIos(entries: readonly ExtractedString[]): string {
	return entries.map((entry) => `"${escapeIos(entry.key)}" = "${escapeIos(entry.value)}";`).join('\n');
}
