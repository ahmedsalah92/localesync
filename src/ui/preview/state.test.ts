// src/ui/preview/state.test.ts — the Preview reducer (LS-12 §2.5). Pure: no React, no bridge.
import { describe, expect, it } from 'vitest';
import type { PreviewRow } from '../../common/models';
import {
	commitDecision,
	initialPreviewState,
	onCommandError,
	previewReducer,
	reapplyAfterImport,
	selectShell,
	translatedCount,
} from './state';
import type { PreviewAction, PreviewState } from './state';

const run = (actions: PreviewAction[], from: PreviewState = initialPreviewState()) =>
	actions.reduce(previewReducer, from);
const rows: PreviewRow[] = [
	{ nodeId: '1', key: 'a', source: 'A', value: 'Ä' },
	{ nodeId: '2', key: 'b', source: 'B', value: null },
];
const applied = (): PreviewState =>
	run([
		{ kind: 'languages', languages: ['de', 'fr'] },
		{ kind: 'apply-started', language: 'de' },
		{ kind: 'result', language: 'de', rows, unmatched: ['z'] },
		{ kind: 'applied', blocked: [] },
	]);

describe('selectShell (LS-12 §2.5)', () => {
	it('is busy while loading, applying or reverting — first', () => {
		expect(selectShell(initialPreviewState())).toBe('busy');
		expect(selectShell(run([{ kind: 'apply-started', language: 'de' }], applied()))).toBe('busy');
		expect(selectShell(run([{ kind: 'revert-started' }], applied()))).toBe('busy');
	});

	it('shows first run when nothing is imported, and the chooser once something is', () => {
		expect(selectShell(run([{ kind: 'languages', languages: [] }]))).toBe('no-languages');
		expect(selectShell(run([{ kind: 'languages', languages: ['de'] }]))).toBe('choose-language');
	});

	it('shows the rows once applied', () => {
		expect(selectShell(applied())).toBeNull();
	});

	it.each([
		['no-keys', 'no-keys'],
		['no-text-nodes', 'no-text-on-page'],
		['storage-failed', 'storage-failed'],
		['mutation-failed', 'operation-failed'],
		['internal', 'operation-failed'],
	] as const)('maps failure %s to %s', (code, shell) => {
		expect(selectShell(run([{ kind: 'failed', code }], applied()))).toBe(shell);
	});

	it('returns to the chooser after a revert, with the rows cleared', () => {
		const reverted = run([{ kind: 'revert-started' }, { kind: 'reverted' }], applied());
		expect(selectShell(reverted)).toBe('choose-language');
		expect(reverted).toMatchObject({ language: null, rows: [], unmatched: [] });
	});
});

describe('editing (LS-12 D6)', () => {
	it('starts with the current value, and cancel leaves nothing to send', () => {
		const editing = run([{ kind: 'edit-start', nodeId: '2', value: 'B' }], applied());
		expect(editing.editing).toEqual({ nodeId: '2', draft: 'B' });
		expect(run([{ kind: 'edit-cancel' }], editing).editing).toBeNull();
	});

	it('commits a changed draft as that row key, and an emptied draft as a deletion', () => {
		const changed = run(
			[
				{ kind: 'edit-start', nodeId: '1', value: 'Ä' },
				{ kind: 'edit-change', draft: 'Neu' },
			],
			applied(),
		);
		expect(commitDecision(changed)).toEqual({ key: 'a', value: 'Neu' });
		const emptied = run([{ kind: 'edit-change', draft: '' }], changed);
		expect(commitDecision(emptied)).toEqual({ key: 'a', value: null });
	});

	// Review Focus 5: no message, no undo step.
	it('commits nothing when the draft equals the current value', () => {
		expect(commitDecision(run([{ kind: 'edit-start', nodeId: '1', value: 'Ä' }], applied()))).toBeNull();
		// A fallback row's editor starts from the source; committing it unchanged adds nothing.
		expect(commitDecision(run([{ kind: 'edit-start', nodeId: '2', value: 'B' }], applied()))).toBeNull();
	});

	it('a new apply drops any open editor', () => {
		const editing = run([{ kind: 'edit-start', nodeId: '1', value: 'Ä' }], applied());
		expect(run([{ kind: 'apply-started', language: 'fr' }], editing).editing).toBeNull();
	});
});

describe('translatedCount', () => {
	it('counts rows with a value', () => {
		expect(translatedCount(rows)).toBe(1);
	});
});

describe('reapplyAfterImport (LS-12 §2.1.7)', () => {
	it('re-applies the previewed language when the import replaced it', () => {
		expect(reapplyAfterImport(applied(), ['fr', 'de'])).toBe('de');
	});

	it('leaves the preview alone when the import did not touch its language', () => {
		expect(reapplyAfterImport(applied(), ['fr'])).toBeNull();
	});

	it('re-applies nothing when nothing is on the canvas', () => {
		const idle = run([{ kind: 'languages', languages: ['de'] }]);
		expect(reapplyAfterImport(idle, ['de'])).toBeNull();
		const reverted = run([{ kind: 'revert-started' }, { kind: 'reverted' }], applied());
		expect(reapplyAfterImport(reverted, ['de'])).toBeNull();
		const restored = run([{ kind: 'failed', code: 'mutation-failed' }], applied());
		expect(reapplyAfterImport(restored, ['de'])).toBeNull();
	});

	it('re-applies after a failed edit save — that failure left the preview in place', () => {
		const unsaved = run([{ kind: 'failed', code: 'storage-failed' }], applied());
		expect(reapplyAfterImport(unsaved, ['de'])).toBe('de');
	});
});

describe('loading failure (LS-12 §2.2)', () => {
	it('settles once a retried state request answers', () => {
		const failed = run([{ kind: 'failed', code: 'internal' }]);
		expect(selectShell(failed)).toBe('operation-failed');
		const retried = run([{ kind: 'languages', languages: ['de'] }], failed);
		expect(retried.phase).toBe('idle');
		expect(selectShell(retried)).toBe('choose-language');
	});

	it('keeps a failure that belongs to an apply', () => {
		const noKeys = run([{ kind: 'failed', code: 'no-keys' }], applied());
		expect(run([{ kind: 'languages', languages: ['de'] }], noKeys).phase).toBe('failed');
	});
});

describe('revert-failed (fix round 1)', () => {
	it('puts the panel back in the applied state with its rows — the preview is still on the canvas', () => {
		const s = run([{ kind: 'revert-started' }, { kind: 'revert-failed' }], applied());
		expect(s.phase).toBe('applied');
		expect(s.language).toBe('de');
		expect(s.rows).toEqual(rows);
		expect(s.unmatched).toEqual(['z']);
		expect(s.errorCode).toBeNull();
		expect(selectShell(s)).toBeNull();
	});

	it('leaves the still-applied language eligible for re-apply after an import', () => {
		const s = run([{ kind: 'revert-started' }, { kind: 'revert-failed' }], applied());
		expect(reapplyAfterImport(s, ['de'])).toBe('de');
	});
});

describe('onCommandError (fix round 1)', () => {
	it('re-applies after a failed edit, so canvas and panel converge', () => {
		expect(onCommandError('edit', 'mutation-failed')).toBe('reapply');
		expect(onCommandError('edit', 'internal')).toBe('reapply');
	});

	it('keeps a failed edit save as its own state — that failure changed nothing', () => {
		expect(onCommandError('edit', 'storage-failed')).toBe('failed');
	});

	it('returns a failed revert to the applied state', () => {
		expect(onCommandError('revert', 'mutation-failed')).toBe('revert-failed');
	});

	it('reports an import failure in the modal', () => {
		expect(onCommandError('import', 'storage-failed')).toBe('import-failed');
	});

	it('fails an apply the ordinary way — its restore makes the copy true', () => {
		expect(onCommandError('apply', 'mutation-failed')).toBe('failed');
		expect(onCommandError('apply', 'no-keys')).toBe('failed');
		expect(onCommandError(null, 'internal')).toBe('failed');
	});

	it('does not re-apply after an edit that failed out of a re-apply-driven state', () => {
		const reapplying = run([{ kind: 'apply-started', language: 'de' }], applied());
		const failed = run([{ kind: 'failed', code: 'mutation-failed' }], reapplying);
		expect(reapplyAfterImport(failed, ['de'])).toBeNull();
	});
});
