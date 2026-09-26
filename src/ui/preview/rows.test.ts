// src/ui/preview/rows.test.ts — the Preview rows the panel renders (LS-12 §2.4). Pure.
import { describe, expect, it } from 'vitest';
import { initialPreviewState, previewReducer } from './state';
import type { PreviewAction, PreviewState } from './state';
import { languageOptions, previewRows } from './rows';

const run = (actions: PreviewAction[]): PreviewState => actions.reduce(previewReducer, initialPreviewState());
const state = (extra: PreviewAction[] = []) =>
	run([
		{ kind: 'languages', languages: ['fr-FR'] },
		{ kind: 'apply-started', language: 'fr-FR' },
		{
			kind: 'result',
			language: 'fr-FR',
			rows: [
				{ nodeId: '1', key: 'a', source: 'A', value: 'À' },
				{ nodeId: '2', key: 'b', source: 'B', value: null },
			],
			unmatched: ['zz'],
		},
		{
			kind: 'applied',
			blocked: [
				{ nodeId: '9', reason: 'missing-font', name: 'Title' },
				{ nodeId: '8', reason: 'empty' },
			],
		},
		...extra,
	]);

describe('previewRows', () => {
	it('renders translated, fallback, then the groups closed', () => {
		const rows = previewRows(state());
		expect(rows.map((r) => r.id)).toEqual(['1', '2', 'unmatched', 'skipped:missing-font', 'skipped:empty']);
		expect(rows[0]).toMatchObject({ kind: 'string', tone: 'fits', primary: 'À', verdict: undefined });
		expect(rows[1]).toMatchObject({
			kind: 'string',
			tone: 'truncates',
			primary: 'B',
			verdict: '•  fallback — no French translation',
		});
	});

	it('marks the row being edited', () => {
		const rows = previewRows(state([{ kind: 'edit-start', nodeId: '2', value: 'B' }]));
		expect(rows[1]).toMatchObject({ kind: 'string', tone: 'editing', editing: true, verdict: '•  editing' });
	});

	it('opens a group to its children — unmatched keys cannot be jumped to', () => {
		const rows = previewRows(
			state([
				{ kind: 'toggle-group', key: 'unmatched' },
				{ kind: 'toggle-group', key: 'skipped:empty' },
			]),
		);
		expect(rows.find((r) => r.id === 'unmatched:zz')).toMatchObject({ kind: 'child', nodeId: null, primary: 'zz' });
		expect(rows.find((r) => r.id === 'skipped:empty:8')).toMatchObject({
			kind: 'child',
			nodeId: '8',
			primary: 'Unnamed layer',
		});
	});
});

describe('languageOptions (LS-34)', () => {
	it('lists the placeholder first, then each stored language by label', () => {
		expect(languageOptions(['de', 'fr-FR'], null).map((o) => o.value)).toEqual(['', 'de', 'fr-FR']);
		expect(languageOptions(['de'], null)[0]).toMatchObject({ label: 'Choose a language', disabled: false });
	});

	// "Choose a language" is not a way back: Revert is. Selecting it did nothing, silently.
	it('disables the placeholder while a language is applied', () => {
		expect(languageOptions(['de'], 'de')[0]?.disabled).toBe(true);
	});
});
