// Enforces the CLAUDE.md / AGENTS.md mirror invariant.
//
// Both files must exist and must be identical apart from the H1 and the mirror-invariant comment
// directly under it: CLAUDE.md is read by Claude Code, AGENTS.md by other agent harnesses, and an
// agent that reads only one of them must get the whole document. Nothing else enforces that, so a
// one-sided edit silently drifts the two apart — this check turns that into a failure.
//
// Not a Vitest test on purpose: vitest.config.ts discovers `src/**/*.test.{ts,tsx}` only, and the
// natural home would be `src/common`, which is deliberately ambient-free (`types: []`) — importing
// `node:fs` there is a compile error by design.
//
// Run: npm run check:docs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const TWINS = ['CLAUDE.md', 'AGENTS.md'];

/** Drop the H1 and the mirror-invariant comment — the only two lines allowed to differ. */
function body(text) {
	return text
		.split('\n')
		.filter((line) => !line.startsWith('# ') && !line.startsWith('<!-- Mirrored '))
		.join('\n');
}

function read(name) {
	try {
		return readFileSync(join(repoRoot, name), 'utf8');
	} catch {
		console.error(`check:docs — FAIL: ${name} is missing. Both twins must exist.`);
		process.exit(1);
	}
}

const [claude, agents] = TWINS.map(read);
const claudeLines = body(claude).split('\n');
const agentLines = body(agents).split('\n');

const mismatches = [];
for (let i = 0; i < Math.max(claudeLines.length, agentLines.length); i++) {
	if (claudeLines[i] !== agentLines[i]) {
		mismatches.push({ line: i + 1, claude: claudeLines[i], agents: agentLines[i] });
	}
}

if (mismatches.length === 0) {
	console.log(`check:docs — OK: ${TWINS.join(' and ')} match (${claudeLines.length} shared lines).`);
	process.exit(0);
}

console.error(`check:docs — FAIL: ${TWINS.join(' and ')} have drifted (${mismatches.length} differing line(s)).`);
console.error('Both files must carry the full document; only the H1 and the mirror comment may differ.\n');
for (const { line, claude: c, agents: a } of mismatches.slice(0, 20)) {
	console.error(`  line ${line}`);
	console.error(`    CLAUDE.md: ${c === undefined ? '(no such line)' : JSON.stringify(c)}`);
	console.error(`    AGENTS.md: ${a === undefined ? '(no such line)' : JSON.stringify(a)}`);
}
if (mismatches.length > 20) console.error(`  … and ${mismatches.length - 20} more.`);
process.exit(1);
