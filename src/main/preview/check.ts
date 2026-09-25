// src/main/preview/check.ts  (main thread; dev-only scaffold for "Run LS-12 preview check")
//
// LS-12 integration harness (spec §3.2). Canvas mutation, byte-identical restore, clientStorage and
// commitUndo counts need the real runtime — a faked `figma` cannot carry them (agent-guidelines §6).
// The pure halves (store, rows) are covered by Vitest; this covers the half that touches the graph.
//
// Driven by a `__dev:preview-check` sentinel. Notes go to the main-thread console.
//
// It calls applyPreview / editPreview / revertPreview DIRECTLY, bypassing the bridge and the handler
// queue in ./index — the same way rtl/check.ts calls applyRtlMirror. Run it alone, with the Preview
// panel idle.
//
// **It mutates the canvas AND the file's stored translations, and restores both.** `finally` always
// reverts the preview and puts the user's store back as it was found — including removing the
// file id and store entry if this run was the first to create them.
//
// Scaffolding only — never run by Vitest. Wired behind import.meta.env.DEV in main.ts.
import type { PreviewMap } from '../../common/models';
import { readStoredKey } from '../extract/persist';
import { applyPreview, editPreview, revertPreview, type PreviewOutcome } from './index';
import { PREVIEW_FILE_ID_KEY, loadStore, saveStore, storeKeyFor } from './persist';
import { emptyStore, mergeImport, translationsFor, type PreviewStore } from './store';

const note = (notes: string[], label: string, ok: boolean, detail = ''): void => {
	notes.push(`ls12:${label}:${ok ? 'PASS' : 'FAIL'}${detail ? ` ${detail}` : ''}`);
};
const skip = (notes: string[], label: string, why: string): void => {
	notes.push(`ls12:${label}:SKIP ${why}`);
};

export interface PreviewCheckReport {
	notes: string[];
}

// from fixtures/preview/* — de.json (nested, flattened per §2.1.3) and the `fr` column of
// translations.csv. The main thread cannot read files, so they are transcribed; keep them in step.
const DE: PreviewMap = {
	language: 'de',
	entries: [
		{ key: 'preview.title', value: 'Willkommen zurück' },
		{ key: 'preview.cta', value: 'In den Warenkorb' },
		{ key: 'preview.mixed', value: 'Gemischt' },
		{ key: 'preview.missing_font', value: 'Schrift fehlt' },
		{ key: 'preview.badge.inst', value: 'Instanz' },
		{ key: 'checkout.old', value: 'Veraltet' },
	],
};
const FR: PreviewMap = {
	language: 'fr',
	entries: [
		{ key: 'preview.title', value: 'Bon retour' },
		{ key: 'preview.cta', value: 'Ajouter au panier' },
		{ key: 'checkout.old', value: 'Obsolète' },
	],
};

/** The fixture's keys (fixtures/preview.md). `missing_font` is the manual row and may be absent. */
const KEY = {
	title: 'preview.title',
	cta: 'preview.cta',
	fallback: 'preview.fallback',
	mixed: 'preview.mixed',
	inst: 'preview.badge.inst',
	missingFont: 'preview.missing_font',
} as const;

function sameStore(a: PreviewStore, b: PreviewStore): boolean {
	const flat = (s: PreviewStore) =>
		Object.entries(s.languages)
			.flatMap(([language, entries]) =>
				Object.entries(entries).map(([key, value]) => `${language}\u0000${key}\u0000${value}`),
			)
			.sort()
			.join('\n');
	return a.v === b.v && flat(a) === flat(b);
}

function describe(outcome: PreviewOutcome | 'saved'): string {
	if (outcome === 'saved') return 'saved (language not active)';
	return outcome.kind === 'ok' ? `ok rows=${outcome.rows.length}` : `${outcome.code}: ${outcome.message}`;
}

export async function runPreviewCheck(): Promise<PreviewCheckReport> {
	const notes: string[] = [];
	await figma.currentPage.loadAsync();

	// The user's store, exactly as found, and whether this file had an id before we touched it.
	const hadFileId = figma.root.getPluginData(PREVIEW_FILE_ID_KEY) !== '';
	const saved = await loadStore();

	try {
		// Start from source: a preview left active by the panel would otherwise become the baseline.
		await revertPreview();

		const texts = figma.currentPage.findAllWithCriteria({ types: ['TEXT'] });
		const chars = (): Map<string, string> => new Map(texts.map((node) => [node.id, node.characters]));
		const baseline = chars();

		// Owners by key — the same rule applyPreview uses (a stamp whose `n` is the node's own id).
		const owners = new Map<string, TextNode>();
		for (const node of texts) {
			const stored = readStoredKey(node);
			if (stored !== null && stored.n === node.id) owners.set(stored.k, node);
		}
		const required = [KEY.title, KEY.cta, KEY.fallback, KEY.mixed, KEY.inst];
		const absent = required.filter((key) => !owners.has(key));
		if (absent.length > 0) {
			note(
				notes,
				'fixture',
				false,
				`no owner for ${absent.join(', ')} — generate preview, then run an Extract page scan (dot scheme); see fixtures/preview.md`,
			);
			return { notes };
		}
		const title = owners.get(KEY.title) as TextNode;
		const cta = owners.get(KEY.cta) as TextNode;
		const fallback = owners.get(KEY.fallback) as TextNode;
		const mixed = owners.get(KEY.mixed) as TextNode;
		const inst = owners.get(KEY.inst) as TextNode;
		const missingFont = owners.get(KEY.missingFont);
		const copy = texts.find((node) => node.id !== title.id && readStoredKey(node)?.k === KEY.title);
		notes.push(
			`ls12:census ${texts.length} text node(s), ${owners.size} owner(s), copy=${copy !== undefined}, missing-font=${missingFont !== undefined}`,
		);
		if (missingFont !== undefined && !missingFont.hasMissingFont) {
			note(notes, 'fixture-missing-font', false, "'missing-font' renders on this machine — use a font it lacks");
		}

		await saveStore(mergeImport(emptyStore(), [DE, FR]));
		const de = Object.fromEntries(DE.entries.map((e) => [e.key, e.value]));
		const fr = Object.fromEntries(FR.entries.map((e) => [e.key, e.value]));
		const read = (node: TextNode): string => node.characters;

		// ── [1] apply-de ─────────────────────────────────────────────────────────────────────────
		const applied = await applyPreview('de');
		if (applied.kind !== 'ok') {
			note(notes, 'apply-de', false, describe(applied));
			return { notes };
		}
		note(
			notes,
			'apply-de',
			read(title) === de[KEY.title] && read(cta) === de[KEY.cta] && read(inst) === de[KEY.inst],
			`title='${read(title)}' cta='${read(cta)}' inst='${read(inst)}'`,
		);
		note(notes, 'apply-de-fallback', read(fallback) === baseline.get(fallback.id), `fallback='${read(fallback)}'`);
		if (copy === undefined)
			skip(notes, 'apply-de-copy', 'no copy of `title` — duplicate it after the Extract scan');
		else note(notes, 'apply-de-copy', read(copy) === baseline.get(copy.id), `copy='${read(copy)}'`);
		// The general form of the three above: every owner reads German, or its source when it has no
		// German or was blocked; every non-owner reads its source.
		const blockedIds = new Set(applied.blocked.map((b) => b.nodeId));
		const ownerIds = new Map([...owners].map(([key, node]) => [node.id, key]));
		const wrong = texts.filter((node) => {
			const key = ownerIds.get(node.id);
			const want =
				key !== undefined && de[key] !== undefined && !blockedIds.has(node.id)
					? de[key]
					: baseline.get(node.id);
			return node.characters !== want;
		});
		note(
			notes,
			'apply-de-every-layer',
			wrong.length === 0,
			wrong.length === 0
				? `${texts.length} layer(s)`
				: wrong.map((n) => `${n.name}='${n.characters}'`).join(' | '),
		);
		const expectedUnmatched = ['checkout.old', ...(missingFont === undefined ? [KEY.missingFont] : [])].sort();
		note(
			notes,
			'apply-de-unmatched',
			applied.unmatched.join(',') === expectedUnmatched.join(','),
			`[${applied.unmatched.join(', ')}] want [${expectedUnmatched.join(', ')}]`,
		);

		// ── [2] blocked ──────────────────────────────────────────────────────────────────────────
		const reasonOf = (node: TextNode) => applied.blocked.find((b) => b.nodeId === node.id)?.reason;
		note(
			notes,
			'blocked-mixed',
			reasonOf(mixed) === 'mixed-font-char-mutation' && read(mixed) === baseline.get(mixed.id),
			`reason=${reasonOf(mixed) ?? 'not blocked'} characters='${read(mixed)}'`,
		);
		if (missingFont === undefined) {
			skip(notes, 'blocked-missing-font', 'no missing-font row on this page — see fixtures/preview.md');
		} else {
			note(
				notes,
				'blocked-missing-font',
				reasonOf(missingFont) === 'missing-font' && read(missingFont) === baseline.get(missingFont.id),
				`reason=${reasonOf(missingFont) ?? 'not blocked'} characters='${read(missingFont)}'`,
			);
		}

		// ── [3] switch-fr ────────────────────────────────────────────────────────────────────────
		const switched = await applyPreview('fr');
		const germanLeft = texts.filter((node) => Object.values(de).some((value) => node.characters.includes(value)));
		note(
			notes,
			'switch-fr',
			switched.kind === 'ok' &&
				read(title) === fr[KEY.title] &&
				read(cta) === fr[KEY.cta] &&
				germanLeft.length === 0,
			`${describe(switched)} title='${read(title)}' cta='${read(cta)}' german-left=${germanLeft.map((n) => n.name).join(',') || 'none'}`,
		);

		// ── [4] revert — byte-identical to the baseline ──────────────────────────────────────────
		const reverted = await revertPreview();
		const dirty = texts.filter((node) => node.characters !== baseline.get(node.id));
		note(
			notes,
			'revert',
			dirty.length === 0 && reverted.failed.length === 0,
			dirty.length === 0
				? `${reverted.succeeded.length} restored`
				: dirty.map((n) => `${n.name}='${n.characters}'`).join(' | '),
		);

		// ── [5] edit while `de` is active ────────────────────────────────────────────────────────
		await applyPreview('de');
		const beforeEdit = chars();
		const edited = await editPreview('de', KEY.title, 'Hallo');
		const changed = texts.filter((node) => node.characters !== beforeEdit.get(node.id));
		const stored = translationsFor(await loadStore(), 'de')[KEY.title];
		note(
			notes,
			'edit-write',
			changed.length === 1 && changed[0]?.id === title.id && read(title) === 'Hallo' && stored === 'Hallo',
			`${describe(edited)} changed=[${changed.map((n) => n.name).join(',')}] stored='${stored ?? ''}'`,
		);
		const deleted = await editPreview('de', KEY.title, null);
		note(
			notes,
			'edit-delete',
			read(title) === baseline.get(title.id) && translationsFor(await loadStore(), 'de')[KEY.title] === undefined,
			`${describe(deleted)} title='${read(title)}'`,
		);
		const first = await editPreview('de', KEY.fallback, 'Nur Englisch');
		note(
			notes,
			'edit-fallback',
			read(fallback) === 'Nur Englisch',
			`${describe(first)} fallback='${read(fallback)}'`,
		);
		await revertPreview();

		// ── [6] storage — clientStorage round trip, stable file id ───────────────────────────────
		const seeded = mergeImport(emptyStore(), [DE, FR]);
		await saveStore(seeded);
		const idFirst = figma.root.getPluginData(PREVIEW_FILE_ID_KEY);
		const loaded = await loadStore();
		await saveStore(loaded);
		const idSecond = figma.root.getPluginData(PREVIEW_FILE_ID_KEY);
		note(
			notes,
			'storage',
			sameStore(loaded, seeded) && idFirst !== '' && idFirst === idSecond,
			`round-trip=${sameStore(loaded, seeded)} file-id=${idFirst === '' ? '(empty)' : idFirst} stable=${idFirst === idSecond}`,
		);

		// ── [7] undo — commitUndo calls per command (R1, R4) ─────────────────────────────────────
		// The property may be read-only in this runtime (rtl/check.ts found it so); then this
		// degrades to a SKIP and the MANUAL line carries the guarantee.
		const realCommitUndo = figma.commitUndo.bind(figma);
		let patched = false;
		let commits = 0;
		try {
			figma.commitUndo = () => {
				commits += 1;
				realCommitUndo();
			};
			patched = true;
		} catch {
			skip(notes, 'undo', 'figma.commitUndo is read-only in this runtime — use the manual check');
		}
		if (patched) {
			try {
				const count = async (fn: () => Promise<unknown>): Promise<number> => {
					const start = commits;
					await fn();
					return commits - start;
				};
				const apply = await count(() => applyPreview('de')); // from a reverted canvas
				const sw = await count(() => applyPreview('fr')); // restoreByOp + withSnapshot
				const write = await count(() => editPreview('fr', KEY.title, 'Salut')); // direct write
				const del = await count(() => editPreview('fr', KEY.title, null)); // restoreNode
				const firstValue = await count(() => editPreview('fr', KEY.fallback, 'Anglais seulement')); // withSnapshot
				note(
					notes,
					'undo',
					apply === 1 && sw === 2 && write === 1 && del === 1 && firstValue === 1,
					`apply=${apply} switch=${sw} edit-write=${write} edit-delete=${del} edit-first=${firstValue} (want 1 2 1 1 1)`,
				);
			} finally {
				figma.commitUndo = realCommitUndo;
			}
		}
		notes.push(
			'ls12:MANUAL — the above counts commitUndo calls, not Figma undo entries. Confirm once by hand: apply a language from the Preview panel, then Cmd-Z ONCE, and the whole preview should revert together.',
		);
	} catch (err) {
		note(notes, 'harness', false, err instanceof Error ? err.message : String(err));
	} finally {
		// Never leave the canvas previewed or the user's translations replaced.
		try {
			await revertPreview();
			if (hadFileId) {
				await saveStore(saved);
			} else {
				const id = figma.root.getPluginData(PREVIEW_FILE_ID_KEY);
				if (id !== '') await figma.clientStorage.deleteAsync(storeKeyFor(id));
				figma.root.setPluginData(PREVIEW_FILE_ID_KEY, ''); // '' removes the entry
			}
			notes.push('ls12:cleanup:PASS canvas reverted and store restored');
		} catch (cleanupErr) {
			notes.push(
				`ls12:cleanup:FAIL ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)} — reopen the plugin; restore-on-launch heals the canvas, but the store may need re-importing`,
			);
		}
	}

	notes.push('ls12:done');
	return { notes };
}
