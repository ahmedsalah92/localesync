// Verifies fixtures/expected/strings.xml against the real Android toolchain (LS-6 §3.3).
//
// Why this exists as a script rather than a Vitest test: it needs `aapt2`, which is not an npm
// dependency and is absent from most machines. `npm test` must stay runnable everywhere, so this
// is opt-in — `npm run check:android` — and SKIPS loudly rather than failing when aapt2 is missing.
//
// What it proves that nothing else can. `fast-xml-parser` proves the file is well-formed XML; it
// says nothing about whether Android accepts it. Two separate defects were caught only here:
//
//   1. Gleef's own export fails to compile — "unescaped apostrophe in string" — which is the
//      evidence justifying every §2.2.8 divergence from it.
//   2. Our first golden failed too, on "multiple substitutions specified in non-positional format"
//      for `%1$s got 50% off`. That produced §2.2.10a and the formatted="false" rule.
//
// Both were invisible to XML parsing and to review.
//
// Getting aapt2, without Android Studio or the SDK: Google publishes it as a standalone Maven
// artifact, ~4MB, no license acceptance. See the block printed when it is not found.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = join(repoRoot, 'fixtures/expected/strings.xml');
const CASES = join(repoRoot, 'fixtures/export-cases.json');

function findAapt2() {
	if (process.env.AAPT2 !== undefined && existsSync(process.env.AAPT2)) return process.env.AAPT2;
	try {
		// `command -v` is a shell builtin, so it needs a shell rather than execFile's direct spawn.
		return execFileSync('sh', ['-c', 'command -v aapt2'], { encoding: 'utf8' }).trim() || null;
	} catch {
		return null;
	}
}

const aapt2 = findAapt2();
if (aapt2 === null || aapt2 === '') {
	console.log(`check:android — SKIPPED: aapt2 not found.

  aapt2 ships as a standalone Maven artifact — no Android Studio, no SDK, no licence prompts:

    V=9.3.2-15703166
    curl -o aapt2.jar "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/$V/aapt2-$V-osx.jar"
    unzip -o aapt2.jar -d aapt2dir && chmod +x aapt2dir/aapt2
    AAPT2=$PWD/aapt2dir/aapt2 npm run check:android

  Use the -linux.jar or -windows.jar classifier on other platforms; list versions at
  https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/maven-metadata.xml`);
	process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'ls6-aapt2-'));
mkdirSync(join(work, 'res/values'), { recursive: true });
copyFileSync(GOLDEN, join(work, 'res/values/strings.xml'));
writeFileSync(
	join(work, 'AndroidManifest.xml'),
	'<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.localesync.goldencheck" />\n',
);

const run = (args) => execFileSync(aapt2, args, { cwd: work, encoding: 'buffer' });

// 1. Compile — this is where invalid resource names and bad escaping are rejected.
try {
	run(['compile', '--dir', 'res', '-o', 'compiled.zip']);
} catch (err) {
	console.error('check:android — FAILED at aapt2 compile:\n');
	console.error(String(err.stderr ?? err.stdout ?? err.message));
	process.exit(1);
}

// 2. Link, so the values land in a real resource table rather than an intermediate.
try {
	run(['link', '-o', 'linked.apk', '--manifest', 'AndroidManifest.xml', 'compiled.zip']);
} catch (err) {
	console.error('check:android — FAILED at aapt2 link:\n');
	console.error(String(err.stderr ?? err.stdout ?? err.message));
	process.exit(1);
}

// 3. Read the strings back out of Android's own string pool and compare to the case set.
//    aapt2 dumps modified UTF-8 (CESU-8): astral characters come back as surrogate pairs, so the
//    bytes must be repaired before comparison or every emoji reads as a mismatch.
const dumped = run(['dump', 'strings', 'linked.apk']);

/**
 * Rewrite CESU-8 surrogate pairs as real UTF-8. A pair is six bytes — ED A0..AF xx ED B0..BF xx —
 * which Node's UTF-8 decoder turns into replacement characters, so every astral codepoint would
 * read as a mismatch and the emoji cases would fail for the wrong reason.
 */
function cesu8ToUtf8(buffer) {
	const out = [];
	for (let i = 0; i < buffer.length; ) {
		const isPair =
			buffer[i] === 0xed &&
			(buffer[i + 1] & 0xf0) === 0xa0 &&
			buffer[i + 3] === 0xed &&
			(buffer[i + 4] & 0xf0) === 0xb0;
		if (isPair) {
			const high = 0xd800 | ((buffer[i + 1] & 0x0f) << 6) | (buffer[i + 2] & 0x3f);
			const low = 0xdc00 | ((buffer[i + 4] & 0x0f) << 6) | (buffer[i + 5] & 0x3f);
			const codePoint = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
			out.push(...Buffer.from(String.fromCodePoint(codePoint), 'utf8'));
			i += 6;
			continue;
		}
		out.push(buffer[i]);
		i += 1;
	}
	return Buffer.from(out).toString('utf8');
}

const pool = cesu8ToUtf8(dumped)
	.split(/^String #\d+ : /m)
	.slice(1)
	.map((entry) => entry.replace(/\n$/, ''));

const cases = JSON.parse(readFileSync(CASES, 'utf8')).entries;
const missing = cases.filter((entry) => !pool.includes(entry.value));

if (missing.length > 0) {
	console.error(`check:android — FAILED: ${missing.length} value(s) did not survive compilation:\n`);
	for (const entry of missing) {
		const codepoints = Array.from(entry.value)
			.map((char) => {
				const code = char.codePointAt(0) ?? 0;
				return code > 32 && code < 127 ? char : `U+${code.toString(16).toUpperCase()}`;
			})
			.join(' ');
		console.error(`  #${entry.n} ${entry.key}: ${codepoints}`);
	}
	process.exit(1);
}

console.log(`check:android — OK: fixtures/expected/strings.xml compiles and links under aapt2.`);
console.log(`check:android — OK: all ${cases.length} values round-trip through Android's string pool.`);
