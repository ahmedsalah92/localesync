// src/main/overflow/calibration.ts  (main thread; dev-only scaffold for "Run LS-23 calibration A/B")
//
// Answers one question the panel cannot: **did the LS-23 recalibration change the flag rate, or did
// the file change underneath it?**
//
// The 34% baseline in LS-23 was measured on a 485-node file that has since grown. Comparing it to a
// fresh scan mixes two effects, so this harness measures BOTH band tables against the SAME node set
// in a single pass — `measureOverflow` takes N candidates per clone, so the shipped candidate and
// the superseded one are measured on the same clone, in the same layout, in the same run. Two
// separate scans could not guarantee that; one edit to the file between them would invalidate it.
//
// It also reports the source-length BAND HISTOGRAM, which decides whether this file is a fair
// instrument at all: the recalibration cut short-string reserve hard and raised long-string reserve
// slightly, so a prose-heavy documentation file and a button-heavy product file move in opposite
// directions. That is a property of the file, not of the model, and it is invisible in a flag rate.
//
// Read-only: it clones to measure and never mutates a user node, so it is safe on any real file.
// Scaffolding only — never run by Vitest (no `figma` runtime). Wired behind import.meta.env.DEV.
import { padToLength } from '../../common/pseudoloc';
import { traverse } from '../traversal';
import { LENGTH_BANDS, expandForLanguage, isUnsupportedLanguage, normalizeLanguageTag } from './expand';
import { measureOverflow } from './measure';

/**
 * The pre-LS-23 table, kept here verbatim so the comparison has a fixed baseline.
 *
 * Deliberately a local copy rather than anything importable: it must NOT track `expand.ts`, or the
 * A/B would silently compare the shipped table against itself and always report "no change".
 */
const SUPERSEDED_BANDS: readonly { maxChars: number; growth: number }[] = [
	{ maxChars: 10, growth: 1.5 },
	{ maxChars: 20, growth: 0.9 },
	{ maxChars: 30, growth: 0.7 },
	{ maxChars: 50, growth: 0.5 },
	{ maxChars: 70, growth: 0.35 },
	{ maxChars: Number.POSITIVE_INFINITY, growth: 0.3 },
];
const SUPERSEDED_FACTORS: Readonly<Record<string, number>> = {
	fi: 1.2,
	de: 1.15,
	nl: 1.1,
	pl: 1.05,
	ru: 1.05,
	es: 1.0,
	pt: 0.95,
	fr: 0.95,
	it: 0.9,
	he: 0.85,
	tr: 0.85,
	ar: 0.85,
};

/** `expandForLanguage` as it behaved before LS-23. Same `padToLength`, so only the table differs. */
function supersededCandidate(source: string, language: string): string {
	if (source.length === 0) return '';
	const growth = SUPERSEDED_BANDS.find((band) => source.length <= band.maxChars)?.growth ?? 0.3;
	const key = language.toLowerCase();
	const factor = SUPERSEDED_FACTORS[key] ?? SUPERSEDED_FACTORS[normalizeLanguageTag(language)] ?? 1.0;
	return padToLength(source, Math.ceil(source.length * (1 + growth * factor)));
}

const bandIndex = (n: number): number => {
	const i = LENGTH_BANDS.findIndex((band) => n <= band.maxChars);
	return i === -1 ? LENGTH_BANDS.length - 1 : i;
};

const bandLabel = (i: number): string => {
	const lo = i === 0 ? 1 : (LENGTH_BANDS[i - 1]?.maxChars ?? 0) + 1;
	const hi = LENGTH_BANDS[i]?.maxChars ?? Number.POSITIVE_INFINITY;
	return hi === Number.POSITIVE_INFINITY ? `${lo}+` : `${lo}-${hi}`;
};

export interface CalibrationReport {
	notes: string[];
}

interface BandTally {
	nodes: number;
	oldFlagged: number;
	newFlagged: number;
	unmeasurable: number;
}

/**
 * Scan the current page under both tables.
 *
 * `language` must be one the model supports — a refused tag (CJK/Thai) has no candidate to compare.
 */
export async function runCalibrationCompare(language = 'de'): Promise<CalibrationReport> {
	const notes: string[] = [];
	if (isUnsupportedLanguage(language)) {
		notes.push(`ls23:SKIP ${language} is refused by the model — no candidate to compare`);
		return { notes };
	}

	const models = await traverse('page');
	// Same eligibility as scanOverflow, so the denominator matches the panel's `of N`.
	const eligible = models.filter((model) => !model.hidden && !model.empty);
	if (eligible.length === 0) {
		notes.push('ls23:SKIP no eligible text nodes on this page');
		return { notes };
	}

	const bands: BandTally[] = LENGTH_BANDS.map(() => ({ nodes: 0, oldFlagged: 0, newFlagged: 0, unmeasurable: 0 }));
	let vanished = 0;

	for (const model of eligible) {
		const live = await figma.getNodeByIdAsync(model.nodeId);
		if (live === null || live.type !== 'TEXT') {
			vanished += 1;
			continue;
		}
		// Index 0 = shipped, index 1 = superseded. One clone, two candidates, same layout.
		const results = await measureOverflow({
			node: live,
			model,
			candidates: [
				expandForLanguage(model.characters, language),
				supersededCandidate(model.characters, language),
			],
		});
		const shipped = results[0];
		const superseded = results[1];
		if (shipped === undefined || superseded === undefined) {
			vanished += 1;
			continue;
		}

		const tally = bands[bandIndex(model.characters.length)];
		if (tally === undefined) continue;
		tally.nodes += 1;

		// `issues` in the panel is every verdict except `fits` (src/common/overflow.ts), so
		// un-measurable rows are counted the same way here. They carry no candidate, which is why
		// they are also reported separately: no band table can move them.
		if (shipped.verdict === 'unmeasurable') tally.unmeasurable += 1;
		if (superseded.verdict !== 'fits') tally.oldFlagged += 1;
		if (shipped.verdict !== 'fits') tally.newFlagged += 1;
	}

	const sum = (pick: (t: BandTally) => number): number => bands.reduce((acc, t) => acc + pick(t), 0);
	const totalNodes = sum((t) => t.nodes);
	const oldTotal = sum((t) => t.oldFlagged);
	const newTotal = sum((t) => t.newFlagged);
	const unmeasurable = sum((t) => t.unmeasurable);
	const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);

	notes.push(
		`ls23:scope page · language ${language} · ${totalNodes} eligible nodes measured${vanished > 0 ? ` (${vanished} skipped)` : ''}`,
	);
	notes.push('ls23:band      nodes    old flagged    new flagged    change');
	bands.forEach((t, i) => {
		if (t.nodes === 0) return;
		const delta = t.newFlagged - t.oldFlagged;
		notes.push(
			`ls23:${bandLabel(i).padStart(7)} ${String(t.nodes).padStart(7)} ` +
				`${`${t.oldFlagged} (${pct(t.oldFlagged, t.nodes)})`.padStart(14)} ` +
				`${`${t.newFlagged} (${pct(t.newFlagged, t.nodes)})`.padStart(14)} ` +
				`${(delta > 0 ? `+${delta}` : String(delta)).padStart(9)}`,
		);
	});

	notes.push(
		`ls23:TOTAL old ${oldTotal}/${totalNodes} (${pct(oldTotal, totalNodes)}) → new ${newTotal}/${totalNodes} (${pct(newTotal, totalNodes)})`,
	);
	// The honest denominator for "did calibration help": un-measurable rows are counted as issues by
	// the panel but are candidate-independent, so they are noise in this comparison.
	const movable = totalNodes - unmeasurable;
	notes.push(
		`ls23:of which un-measurable (cannot move with any table): ${unmeasurable} — ` +
			`measurable-only rate old ${pct(oldTotal - unmeasurable, movable)} → new ${pct(newTotal - unmeasurable, movable)}`,
	);
	notes.push(
		'ls23:NOTE the band histogram above says whether this file is a fair instrument. LS-23 cut ' +
			'short-string reserve hard and raised long-string reserve slightly, so a prose-heavy file ' +
			'and a button-heavy file move in OPPOSITE directions.',
	);
	notes.push('ls23:done');
	return { notes };
}
