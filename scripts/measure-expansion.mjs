// scripts/measure-expansion.mjs — LS-23 calibration evidence.
//
// Measures how much professionally-translated real UI text actually grows, per source-length band,
// so `LENGTH_BANDS` in src/main/overflow/expand.ts stops being an assumption. Reads nothing from
// src/ and writes nothing to it: this script only reports.
//
// Source data are openly-licensed gettext catalogues. A .po file carries msgid (English source) and
// msgstr (professional translation) in one entry, so the pairs come pre-joined — no cross-repo
// matching, and no translation budget. Three corpora, chosen so a finding has to replicate before
// it counts:
//
//   gnome  10 desktop apps  — broad UI-string coverage
//   kde     3 desktop apps  — an INDEPENDENT translator community, so agreement is replication
//   gimp    1 graphics app  — register control: is a desktop corpus representative of a design tool?
//
//   node scripts/measure-expansion.mjs [--json] [--refresh]
//
// Downloads are cached under .cache/ls23-corpus (gitignored). Each file's sha256 is reported, so a
// re-run that produces different numbers can be traced to changed source data rather than to drift
// in this script.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE = path.join(process.cwd(), '.cache', 'ls23-corpus');
const REFRESH = process.argv.includes('--refresh');
const AS_JSON = process.argv.includes('--json');
const AS_FIXTURE = process.argv.includes('--fixture');

const GNOME = [
	'nautilus',
	'gnome-calculator',
	'gnome-text-editor',
	'gnome-control-center',
	'gnome-calendar',
	'gnome-software',
	'gnome-disk-utility',
	'gnome-clocks',
	'eog',
	'gnome-weather',
];
const KDE = [
	['kate', 'utilities'],
	['dolphin', 'system'],
	['okular', 'graphics'],
];
// Every language in LANGUAGE_FACTORS. Correcting only the two that were measured would
// leave ten assumptions sitting next to two measurements in the same table.
const LOCALES = ['fi', 'de', 'nl', 'pl', 'ru', 'es', 'pt', 'fr', 'it', 'he', 'tr', 'ar'];

/** Every file the sample is drawn from. Branch is part of the URL; sha256 pins the bytes. */
function manifest() {
	const out = [];
	for (const locale of LOCALES) {
		for (const app of GNOME) {
			out.push({
				corpus: 'gnome',
				app,
				locale,
				urls: ['main', 'master'].map((b) => `https://gitlab.gnome.org/GNOME/${app}/-/raw/${b}/po/${locale}.po`),
			});
		}
		for (const [app, group] of KDE) {
			out.push({
				corpus: 'kde',
				app,
				locale,
				urls: [`https://invent.kde.org/${group}/${app}/-/raw/master/po/${locale}/${app}.po`],
			});
		}
		out.push({
			corpus: 'gimp',
			app: 'gimp',
			locale,
			urls: [`https://gitlab.gnome.org/GNOME/gimp/-/raw/master/po/${locale}.po`],
		});
	}
	return out;
}

async function fetchCorpus() {
	await mkdir(CACHE, { recursive: true });
	const files = [];
	for (const entry of manifest()) {
		const name = `${entry.corpus}.${entry.app}.${entry.locale}.po`;
		const dest = path.join(CACHE, name);
		if (REFRESH || !existsSync(dest)) {
			let saved = false;
			for (const url of entry.urls) {
				const res = await fetch(url);
				if (!res.ok) continue;
				const body = await res.text();
				// A missing branch can still answer 200 with an HTML error page. Test for catalogue
				// STRUCTURE, not size: a byte floor silently drops small-but-valid catalogues, which
				// is how gnome-weather went missing from the first run of this script.
				if (!/^msgid /mu.test(body) || !/^msgstr /mu.test(body)) continue;
				await writeFile(dest, body, 'utf8');
				saved = true;
				break;
			}
			if (!saved) {
				console.error(`skipped ${name}: no branch served a catalogue`);
				continue;
			}
		}
		const bytes = await readFile(dest);
		files.push({ ...entry, name, sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16) });
	}
	return files;
}

// ── .po parsing ────────────────────────────────────────────────────────────────────────────────
const UNESCAPE = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' };

/** Decode one quoted gettext string literal, honouring backslash escapes. */
function unquote(line) {
	const body = line.slice(line.indexOf('"') + 1, line.lastIndexOf('"'));
	let out = '';
	for (let i = 0; i < body.length; i += 1) {
		if (body[i] === '\\' && i + 1 < body.length) {
			out += UNESCAPE[body[i + 1]] ?? body[i + 1];
			i += 1;
		} else out += body[i];
	}
	return out;
}

/** Entries as {msgid, msgstr, fuzzy, plural}. Obsolete (`#~`) entries are dropped outright. */
function parsePo(text) {
	const entries = [];
	let cur = null;
	let key = null;
	const flush = () => {
		if (cur && cur.msgid !== null) entries.push(cur);
		cur = null;
		key = null;
	};
	for (const raw of text.split('\n')) {
		const line = raw.replace(/\r$/u, '');
		if (line.startsWith('#~')) continue;
		if (line.trim() === '') {
			flush();
			continue;
		}
		cur ??= { msgid: null, msgstr: null, fuzzy: false, plural: false };
		if (line.startsWith('#,')) cur.fuzzy = line.includes('fuzzy');
		else if (line.startsWith('#')) continue;
		else if (line.startsWith('msgid_plural')) {
			cur.plural = true;
			key = null;
		} else if (line.startsWith('msgid ')) {
			key = 'msgid';
			cur.msgid = unquote(line);
		} else if (line.startsWith('msgstr[')) {
			cur.plural = true;
			key = null;
		} else if (line.startsWith('msgstr ')) {
			key = 'msgstr';
			cur.msgstr = unquote(line);
		} else if (line.startsWith('msgctxt')) key = null;
		else if (line.trimStart().startsWith('"') && key) cur[key] = (cur[key] ?? '') + unquote(line);
	}
	flush();
	return entries;
}

// ── filters ────────────────────────────────────────────────────────────────────────────────────
// Each rule exists to stop a length comparison that would measure something other than translation
// growth. Rejections are counted and reported, so the sample is auditable rather than asserted.
const MNEMONIC = /_(?=[^\W_])/gu; // GTK accelerator: `_Open`, `Sa_ve` — not part of the rendered text
const MARKUP = /<[a-zA-Z/!?]/u;
const PLACEHOLDER = /%(?:\d+\$)?[-#0-9.+ ]*[a-zA-Z%]|%\([^)]+\)[a-zA-Z]|\{[^}]*\}/u;
const HAS_LETTER = /\p{L}/u;
const URLISH = /https?:\/\/|www\.|\S+@\S+\./u;

const strip = (s) => s.replace(MNEMONIC, '').replace(/__/gu, '_');

function rejectReason(src, tgt) {
	if (!src || !tgt) return 'empty';
	if (/[\n\t]/u.test(src) || /[\n\t]/u.test(tgt)) return 'multiline';
	if (MARKUP.test(src) || MARKUP.test(tgt)) return 'markup';
	if (URLISH.test(src) || URLISH.test(tgt)) return 'url-or-email';
	// Placeholder length is runtime-dependent and identical in both languages, so it is noise in a
	// length ratio. Dropping the whole entry is stricter than needed and costs nothing at this n.
	if (PLACEHOLDER.test(src) || PLACEHOLDER.test(tgt)) return 'placeholder';
	if (!HAS_LETTER.test(src)) return 'no-letters';
	if (src.length > 200) return 'over-200-chars';
	return null;
}

// ── measuring ──────────────────────────────────────────────────────────────────────────────────
// Mirrors src/main/overflow/expand.ts. Kept as a literal copy rather than imported: expand.ts is a
// main-thread module, and this must keep reporting what the SHIPPED table did even after it is
// revised — a comparison against a moving baseline would say nothing.
const LENGTH_BANDS = [
	{ maxChars: 10, growth: 1.5 },
	{ maxChars: 20, growth: 0.9 },
	{ maxChars: 30, growth: 0.7 },
	{ maxChars: 50, growth: 0.5 },
	{ maxChars: 70, growth: 0.35 },
	{ maxChars: Infinity, growth: 0.3 },
];
const LANGUAGE_FACTORS = {
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

const bandIndex = (n) => LENGTH_BANDS.findIndex((b) => n <= b.maxChars);
const bandLabel = (i) => {
	const lo = i === 0 ? 1 : LENGTH_BANDS[i - 1].maxChars + 1;
	const hi = LENGTH_BANDS[i].maxChars;
	return hi === Infinity ? `${lo}+` : `${lo}-${hi}`;
};

/** Linear-interpolated percentile, so p90 of a small band is not silently rounded to a member. */
function percentile(values, p) {
	if (values.length === 0) return NaN;
	const v = [...values].sort((a, b) => a - b);
	const k = ((v.length - 1) * p) / 100;
	const lo = Math.floor(k);
	const hi = Math.ceil(k);
	return lo === hi ? v[lo] : v[lo] * (hi - k) + v[hi] * (k - lo);
}

const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
/** Longest whitespace-free run: what a fixed-width container actually breaks on. */
const longestToken = (s) =>
	Math.max(
		1,
		...s
			.split(/\s+/u)
			.filter(Boolean)
			.map((t) => t.length),
	);

async function collect(files) {
	const pairs = new Map(); // `${corpus}/${locale}` -> [src, tgt][]
	const rejected = new Map();
	const seen = new Map();
	const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
	for (const f of files) {
		const text = await readFile(path.join(CACHE, f.name), 'utf8');
		const key = `${f.corpus}/${f.locale}`;
		if (!pairs.has(key)) {
			pairs.set(key, []);
			seen.set(key, new Set());
		}
		for (const e of parsePo(text)) {
			if (e.fuzzy || e.plural || !e.msgid || !e.msgstr) {
				bump(rejected, 'fuzzy/plural/untranslated');
				continue;
			}
			const src = strip(e.msgid);
			const tgt = strip(e.msgstr);
			const why = rejectReason(src, tgt);
			if (why) {
				bump(rejected, why);
				continue;
			}
			// NUL-separated: a plain space would merge `"a b"|"c"` with `"a"|"b c"`.
			const id = `${src}\u0000${tgt}`;
			if (seen.get(key).has(id)) {
				bump(rejected, 'duplicate');
				continue;
			}
			seen.get(key).add(id);
			pairs.get(key).push([src, tgt]);
		}
	}
	return { pairs, rejected };
}

function bandStats(rows, factor, growth) {
	const g = rows.map(([s, t]) => t.length / s.length - 1);
	const ratio = 1 + growth * factor;
	const covered = rows.filter(([s, t]) => t.length <= Math.ceil(s.length * ratio)).length;
	return {
		n: rows.length,
		mean: mean(g),
		p50: percentile(g, 50),
		p75: percentile(g, 75),
		p90: percentile(g, 90),
		p95: percentile(g, 95),
		p99: percentile(g, 99),
		coveragePct: (100 * covered) / rows.length,
		candidateOverActual: mean(rows.map(([s, t]) => Math.ceil(s.length * ratio) / t.length)),
	};
}

const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3).padStart(7) : '      —');
const f1 = (x) => x.toFixed(1).padStart(7);

const groupByBand = (rows) => {
	const out = Array.from({ length: LENGTH_BANDS.length }, () => []);
	for (const [s, t] of rows) out[bandIndex(s.length)].push([s, t]);
	return out;
};

function table(title, rowsByBand, factor) {
	console.log(`\n${title}`);
	console.log(
		[
			'   band',
			'     n',
			'shipped',
			'   mean',
			'    p50',
			'    p75',
			'    p90',
			'    p95',
			' cover%',
			'cand/act',
		].join(' '),
	);
	for (let i = 0; i < LENGTH_BANDS.length; i += 1) {
		const rows = rowsByBand[i] ?? [];
		if (rows.length === 0) {
			console.log(`${bandLabel(i).padStart(7)} ${'0'.padStart(6)}`);
			continue;
		}
		const s = bandStats(rows, factor, LENGTH_BANDS[i].growth);
		console.log(
			[
				bandLabel(i).padStart(7),
				String(s.n).padStart(6),
				f3(LENGTH_BANDS[i].growth * factor),
				f3(s.mean),
				f3(s.p50),
				f3(s.p75),
				f3(s.p90),
				f3(s.p95),
				f1(s.coveragePct),
				s.candidateOverActual.toFixed(2).padStart(8),
			].join(' '),
		);
	}
}

// Languages the shipped table treats as the 1.0 reference ("European average"). Keeping that
// anchor means DEFAULT_LANGUAGE_FACTOR still means what its comment says after recalibration.
const EUROPEAN = ['fi', 'de', 'nl', 'pl', 'ru', 'es', 'pt', 'fr', 'it'];

/**
 * Fit `growth(band) x factor(locale)` to the observed p90 grid.
 *
 * The shipped model is a rank-1 product, so this is a rank-1 approximation of the p90 matrix,
 * solved by alternating least squares. Both tables are fitted TOGETHER — doing bands first and
 * factors afterwards would bake the old, wrong factors into the new band values.
 *
 * Linear space rather than log space, which the obvious two-way additive fit would use: Arabic and
 * Hebrew have an observed p90 growth of zero or slightly negative in the long bands (their
 * translations are no longer than the English source), and `log(0)` is undefined. That is a real
 * property of those languages, not bad data, so the fit has to tolerate it.
 *
 * Rescaled so the EUROPEAN factors have geometric mean 1.0, preserving the meaning the shipped
 * table's `1.0 = European average` comment already claims.
 */
function fitRankOne(grid, locales, nBands) {
	const g = locales.map((loc) => grid[loc]);
	let F = locales.map(() => 1);
	let G = Array.from({ length: nBands }, () => 1);
	const dot = (a, b) => a.reduce((acc, v, i) => acc + v * b[i], 0);
	for (let iter = 0; iter < 200; iter += 1) {
		// G_b = sum_L g(L,b) F_L / sum_L F_L^2
		const denomG = dot(F, F);
		G = Array.from(
			{ length: nBands },
			(_, b) =>
				dot(
					locales.map((_, i) => g[i][b]),
					F,
				) / denomG,
		);
		const denomF = dot(G, G);
		F = locales.map((_, i) => dot(g[i], G) / denomF);
	}
	const euroLogs = locales
		.map((loc, i) => [loc, F[i]])
		.filter(([loc]) => EUROPEAN.includes(loc))
		.map(([, v]) => Math.log(v));
	const scale = Math.exp(mean(euroLogs));
	return {
		factors: Object.fromEntries(locales.map((loc, i) => [loc, F[i] / scale])),
		growths: G.map((v) => v * scale),
		/** Predicted minus observed, per cell — where the one-table-x-one-factor shape strains. */
		residuals: Object.fromEntries(locales.map((loc, i) => [loc, G.map((gb, b) => gb * F[i] - g[i][b])])),
	};
}

/** Coverage and mean candidate/actual for one locale under an arbitrary band table + factor. */
function scoreLocale(rows, growths, factor) {
	const cand = ([s]) => Math.ceil(s.length * (1 + growths[bandIndex(s.length)] * factor));
	const cov = (100 * rows.filter((r) => r[1].length <= cand(r)).length) / rows.length;
	return { cov, ca: mean(rows.map((r) => cand(r) / r[1].length)) };
}

async function main() {
	const files = await fetchCorpus();
	const { pairs, rejected } = await collect(files);

	const pooled = {};
	for (const [key, rows] of pairs) {
		const loc = key.split('/')[1];
		(pooled[loc] ??= []).push(...rows);
	}
	// A locale whose catalogues all failed to fetch must drop out rather than poison the fit.
	const locales = LOCALES.filter((loc) => (pooled[loc]?.length ?? 0) > 0);
	const total = locales.reduce((a, loc) => a + pooled[loc].length, 0);

	const TARGET = 90;
	const p90grid = Object.fromEntries(
		locales.map((loc) => [
			loc,
			groupByBand(pooled[loc]).map((rows) =>
				percentile(
					rows.map(([s, t]) => t.length / s.length - 1),
					TARGET,
				),
			),
		]),
	);

	if (AS_FIXTURE) {
		// The evidence `src/main/overflow/expand.test.ts` asserts against. Only the observed p90 grid
		// is recorded — NOT the fitted table — so the test checks the shipped values against the
		// measurement, and cannot be satisfied by a table that merely restates itself.
		const round4 = (x) => Math.round(x * 10000) / 10000;
		const fixture = {
			$comment:
				'Observed p90 translation growth by source-length band. Regenerate with `node scripts/measure-expansion.mjs --fixture`. Authority is the corpus, not a spec table: see docs/expansion-calibration.md.',
			measured: new Date().toISOString().slice(0, 10),
			targetPercentile: TARGET,
			corpora: [...new Set(files.map((f) => f.corpus))],
			catalogues: files.length,
			pairs: total,
			bands: LENGTH_BANDS.map((_, i) => bandLabel(i)),
			observedP90: Object.fromEntries(locales.map((loc) => [loc, p90grid[loc].map(round4)])),
		};
		// Scalar arrays collapsed onto one line, matching the other fixtures' compact style.
		const text = JSON.stringify(fixture, null, '\t').replace(/\[[^[\]{}]*?\]/gsu, (m) =>
			m.replace(/\s+/gu, ' ').replace(/\[ /u, '[').replace(/ \]/u, ']'),
		);
		await writeFile('fixtures/expansion-p90.json', `${text}\n`, 'utf8');
		console.log(`wrote fixtures/expansion-p90.json (${locales.length} locales, ${total} pairs)`);
		return;
	}

	if (AS_JSON) {
		const fit = fitRankOne(p90grid, locales, LENGTH_BANDS.length);
		console.log(
			JSON.stringify(
				{
					provenance: files.map(({ name, corpus, app, locale, sha256 }) => ({
						name,
						corpus,
						app,
						locale,
						sha256,
					})),
					rejected: Object.fromEntries(rejected),
					target: `p${TARGET}`,
					observedP90: p90grid,
					fit,
					locales: Object.fromEntries(
						locales.map((loc) => [
							loc,
							{
								shippedFactor: LANGUAGE_FACTORS[loc],
								n: pooled[loc].length,
								bands: groupByBand(pooled[loc]).map((rows, i) => ({
									band: bandLabel(i),
									shippedGrowth: LENGTH_BANDS[i].growth,
									...bandStats(rows, LANGUAGE_FACTORS[loc], LENGTH_BANDS[i].growth),
								})),
							},
						]),
					),
				},
				null,
				1,
			),
		);
		return;
	}

	console.log('LS-23 - observed translation growth vs the shipped LENGTH_BANDS');
	console.log(`sample: ${files.length} catalogues, ${locales.length} locales, ${total} filtered pairs`);
	console.log(`rejected: ${[...rejected].map(([k, v]) => `${k}=${v}`).join(' ')}`);

	console.log(`\n${'='.repeat(92)}`);
	console.log('PER-LOCALE - observed growth by source-length band, pooled across all three corpora');
	console.log(`shipped cover% = share of real translations no longer than the model's candidate`);
	console.log('='.repeat(92));
	console.log(
		[
			'locale',
			'     n',
			'factor',
			'|',
			...LENGTH_BANDS.map((_, i) => bandLabel(i).padStart(7)),
			'|',
			'cover%',
			'  c/a',
		].join(' '),
	);
	for (const loc of locales) {
		const whole = scoreLocale(
			pooled[loc],
			LENGTH_BANDS.map((b) => b.growth),
			LANGUAGE_FACTORS[loc],
		);
		console.log(
			[
				loc.padStart(6),
				String(pooled[loc].length).padStart(6),
				LANGUAGE_FACTORS[loc].toFixed(2).padStart(6),
				'|',
				...p90grid[loc].map((v) => f3(v)),
				'|',
				whole.cov.toFixed(1).padStart(6),
				whole.ca.toFixed(2).padStart(5),
			].join(' '),
		);
	}

	console.log(`\n${'='.repeat(92)}`);
	console.log('PER-LOCALE DETAIL - full distribution per band, against the shipped values');
	console.log('='.repeat(92));
	for (const loc of locales) {
		table(
			`-- ${loc}  (n=${pooled[loc].length}, shipped factor ${LANGUAGE_FACTORS[loc]})`,
			groupByBand(pooled[loc]),
			LANGUAGE_FACTORS[loc],
		);
	}

	console.log(`\n${'='.repeat(92)}`);
	console.log('REPLICATION - band-1 p90 per corpus. A finding counts only if independent teams agree.');
	console.log('='.repeat(92));
	const corpora = [...new Set([...pairs.keys()].map((k) => k.split('/')[0]))].sort();
	console.log(['locale', ...corpora.map((c) => c.padStart(8))].join(' '));
	for (const loc of locales) {
		const cells = corpora.map((c) => {
			const rows = pairs.get(`${c}/${loc}`);
			if (!rows) return '       -';
			const b1 = groupByBand(rows)[0].map(([s, t]) => t.length / s.length - 1);
			return (b1.length ? percentile(b1, TARGET).toFixed(3) : '-').padStart(8);
		});
		console.log([loc.padStart(6), ...cells].join(' '));
	}

	console.log(`\n${'='.repeat(92)}`);
	console.log('THE WRAPPING DIMENSION - growth of the LONGEST UNBREAKABLE TOKEN (p90)');
	console.log('A container breaks on the longest token it cannot wrap, which is NOT total length.');
	console.log('='.repeat(92));
	console.log(['locale', 'total p90', 'token p90', 'token/total'].join('  '));
	for (const loc of locales) {
		const tot = percentile(
			pooled[loc].map(([s, t]) => t.length / s.length - 1),
			TARGET,
		);
		const tokg = percentile(
			pooled[loc].map(([s, t]) => longestToken(t) / longestToken(s) - 1),
			TARGET,
		);
		console.log(
			[
				loc.padStart(6),
				f3(tot).padStart(9),
				f3(tokg).padStart(11),
				((1 + tokg) / (1 + tot)).toFixed(2).padStart(11),
			].join('  '),
		);
	}

	const { factors, growths, residuals } = fitRankOne(p90grid, locales, LENGTH_BANDS.length);
	const round2 = (x) => Math.round(x * 100) / 100;
	const fittedGrowths = growths.map(round2);
	const fittedFactors = Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, round2(v)]));

	console.log(`\n${'='.repeat(92)}`);
	console.log(`JOINT FIT to p${TARGET} - growth(band) x factor(locale), solved together by ALS`);
	console.log('anchored so EUROPEAN factors have geometric mean 1.0, preserving DEFAULT_LANGUAGE_FACTOR');
	console.log('='.repeat(92));
	console.log(`bands   shipped: ${LENGTH_BANDS.map((b) => b.growth.toFixed(2)).join(' ')}`);
	console.log(`bands    fitted: ${fittedGrowths.map((v) => v.toFixed(2)).join(' ')}`);
	console.log('\nfactors:');
	console.log(['locale', 'shipped', 'fitted', 'change'].join('  '));
	for (const loc of locales) {
		const d = fittedFactors[loc] - LANGUAGE_FACTORS[loc];
		console.log(
			[
				loc.padStart(6),
				LANGUAGE_FACTORS[loc].toFixed(2).padStart(7),
				fittedFactors[loc].toFixed(2).padStart(6),
				(d >= 0 ? '+' : '') + d.toFixed(2),
			].join('  '),
		);
	}

	console.log(`\n${'='.repeat(92)}`);
	console.log('EFFECT - every locale, shipped table+factors vs fitted table+factors');
	console.log('='.repeat(92));
	console.log(['locale', 'ship cov%', 'fit cov%', '|', 'ship c/a', 'fit c/a'].join('  '));
	const before = [];
	const after = [];
	for (const loc of locales) {
		const shipped = scoreLocale(
			pooled[loc],
			LENGTH_BANDS.map((bd) => bd.growth),
			LANGUAGE_FACTORS[loc],
		);
		const fit = scoreLocale(pooled[loc], fittedGrowths, fittedFactors[loc]);
		before.push(shipped);
		after.push(fit);
		console.log(
			[
				loc.padStart(6),
				shipped.cov.toFixed(1).padStart(9),
				fit.cov.toFixed(1).padStart(8),
				'|',
				shipped.ca.toFixed(2).padStart(8),
				fit.ca.toFixed(2).padStart(7),
			].join('  '),
		);
	}
	// Coverage FALLING in an over-reserved locale is the intended correction, not a regression: the
	// fit targets p90 everywhere. So the honest summary is consistency and over-reservation, not a
	// count of locales that improved on both axes at once.
	const span = (xs) => `${Math.min(...xs).toFixed(1)}-${Math.max(...xs).toFixed(1)}`;
	console.log(
		`\ncoverage spread : ${span(before.map((x) => x.cov))} -> ${span(after.map((x) => x.cov))}  (target p${TARGET})`,
	);
	console.log(
		`mean cand/actual: ${mean(before.map((x) => x.ca)).toFixed(2)}x -> ${mean(after.map((x) => x.ca)).toFixed(2)}x`,
	);
	console.log(
		`worst covered   : ${Math.min(...before.map((x) => x.cov)).toFixed(1)}% -> ${Math.min(...after.map((x) => x.cov)).toFixed(1)}%`,
	);

	console.log(`\n${'='.repeat(92)}`);
	console.log('RESIDUALS - fitted minus observed p90. Where ONE band table x ONE factor strains.');
	console.log('='.repeat(92));
	console.log(['locale', ...LENGTH_BANDS.map((_, i) => bandLabel(i).padStart(7))].join(' '));
	for (const loc of locales) {
		console.log(
			[loc.padStart(6), ...residuals[loc].map((v) => ((v >= 0 ? '+' : '') + v.toFixed(2)).padStart(7))].join(' '),
		);
	}

	console.log('\nprovenance (sha256, first 16):');
	for (const f of files) console.log(`  ${f.sha256}  ${f.name}`);
}

await main();
