// src/main/snapshot/plan.test.ts — pure unit tests (no `figma`, no DOM). Imports the pure seams
// only; ./index pulls in the `figma` global (loadFontAsync, clientStorage) and cannot load under
// Vitest. Every case derives from LS-4 spec §2 (Resolved Defaults) and §3 (Concrete Acceptance).
import { describe, expect, it } from 'vitest';
import {
	deserializeSnapshot,
	isRecognizedSchema,
	mergeManifest,
	mutationBlockReason,
	planRestore,
	removeFromManifest,
	serializeSnapshot,
} from './plan';
import type { EligibilityFlags, Manifest, MutationOp, RestoreStep, TextNodeSnapshot } from './types';

const OPS: MutationOp[] = ['pseudoloc', 'preview', 'rtl-mirror'];

function flags(overrides: Partial<EligibilityFlags> = {}): EligibilityFlags {
	return { hasMissingFont: false, isMixedFont: false, inInstance: false, empty: false, ...overrides };
}

function makeSnapshot(overrides: Partial<TextNodeSnapshot> = {}): TextNodeSnapshot {
	return {
		schemaVersion: 1,
		nodeId: '1:2',
		op: 'pseudoloc',
		characters: 'Hello',
		textAutoResize: 'NONE',
		textTruncation: 'DISABLED',
		maxLines: null,
		width: 120,
		height: 24,
		x: 10,
		y: 20,
		textAlignHorizontal: 'LEFT',
		textAlignVertical: 'TOP',
		capturedAt: 1_700_000_000_000,
		...overrides,
	};
}

const kinds = (steps: RestoreStep[]): RestoreStep['kind'][] => steps.map((s) => s.kind);

describe('mutationBlockReason — the op × flag matrix (Resolved Defaults §1)', () => {
	it('passes an all-clear node for every op', () => {
		for (const op of OPS) expect(mutationBlockReason(flags(), op)).toBeNull();
	});

	it('blocks a missing-font node for every op', () => {
		for (const op of OPS) expect(mutationBlockReason(flags({ hasMissingFont: true }), op)).toBe('missing-font');
	});

	it('blocks an empty node for every op', () => {
		for (const op of OPS) expect(mutationBlockReason(flags({ empty: true }), op)).toBe('empty');
	});

	it('blocks a mixed-font node for the char-writing ops but allows rtl-mirror', () => {
		expect(mutationBlockReason(flags({ isMixedFont: true }), 'pseudoloc')).toBe('mixed-font-char-mutation');
		expect(mutationBlockReason(flags({ isMixedFont: true }), 'preview')).toBe('mixed-font-char-mutation');
		expect(mutationBlockReason(flags({ isMixedFont: true }), 'rtl-mirror')).toBeNull();
	});

	it('blocks an instance child for rtl-mirror but allows the char-writing ops', () => {
		expect(mutationBlockReason(flags({ inInstance: true }), 'rtl-mirror')).toBe('instance-locked');
		expect(mutationBlockReason(flags({ inInstance: true }), 'pseudoloc')).toBeNull();
		expect(mutationBlockReason(flags({ inInstance: true }), 'preview')).toBeNull();
	});

	describe('precedence — first matching row wins, top-to-bottom', () => {
		it('missing-font beats empty', () => {
			expect(mutationBlockReason(flags({ hasMissingFont: true, empty: true }), 'pseudoloc')).toBe('missing-font');
		});

		it('missing-font beats every lower flag at once', () => {
			const all = flags({ hasMissingFont: true, empty: true, isMixedFont: true, inInstance: true });
			for (const op of OPS) expect(mutationBlockReason(all, op)).toBe('missing-font');
		});

		it('empty beats mixed-font', () => {
			expect(mutationBlockReason(flags({ empty: true, isMixedFont: true }), 'pseudoloc')).toBe('empty');
		});

		it('mixed+instance resolves per-op: mixed blocks the char op, instance blocks the layout op', () => {
			const mixedAndInstance = flags({ isMixedFont: true, inInstance: true });
			expect(mutationBlockReason(mixedAndInstance, 'pseudoloc')).toBe('mixed-font-char-mutation');
			expect(mutationBlockReason(mixedAndInstance, 'rtl-mirror')).toBe('instance-locked');
		});
	});
});

describe('snapshot serialize/deserialize', () => {
	it('round-trips every field', () => {
		const snapshot = makeSnapshot({
			textAutoResize: 'WIDTH_AND_HEIGHT',
			textTruncation: 'ENDING',
			maxLines: 3,
			textAlignHorizontal: 'CENTER',
			textAlignVertical: 'BOTTOM',
		});
		expect(deserializeSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot);
	});

	it('recognizes the current schema version and flags anything else — without throwing', () => {
		expect(isRecognizedSchema(makeSnapshot())).toBe(true);
		const future = { ...makeSnapshot(), schemaVersion: 2 };
		const json = JSON.stringify(future);
		expect(() => deserializeSnapshot(json)).not.toThrow();
		expect(isRecognizedSchema(deserializeSnapshot(json))).toBe(false);
	});
});

describe('manifest merge/remove helpers', () => {
	const entry = (op: MutationOp): Manifest[string] => ({ op, capturedAt: 1 });

	it('merges a batch delta over the base, later entries winning', () => {
		const base: Manifest = { a: entry('pseudoloc') };
		const merged = mergeManifest(base, { b: entry('preview'), a: entry('rtl-mirror') });
		expect(merged).toEqual({ a: entry('rtl-mirror'), b: entry('preview') });
		expect(base).toEqual({ a: entry('pseudoloc') }); // non-mutating
	});

	it('removes listed nodes and is idempotent for absent ids', () => {
		const base: Manifest = { a: entry('pseudoloc'), b: entry('preview') };
		expect(removeFromManifest(base, ['a'])).toEqual({ b: entry('preview') });
		expect(removeFromManifest(base, ['a', 'a', 'missing'])).toEqual({ b: entry('preview') });
		expect(base).toEqual({ a: entry('pseudoloc'), b: entry('preview') }); // non-mutating
	});
});

describe('planRestore — per-mode step sequence (Resolved Defaults §3)', () => {
	it("NONE → resize BEFORE mode (resizeWithoutConstraints resets textAutoResize, so re-assert it)", () => {
		const steps = planRestore(makeSnapshot({ textAutoResize: 'NONE' }));
		expect(kinds(steps)).toEqual(['set-characters', 'resize', 'set-auto-resize', 'set-truncation', 'set-position', 'set-align']);
		const resizeAt = kinds(steps).indexOf('resize');
		const modeAt = kinds(steps).indexOf('set-auto-resize');
		expect(resizeAt).toBeLessThan(modeAt);
		expect(steps[modeAt]).toMatchObject({ mode: 'NONE' });
	});

	it('HEIGHT → resize BEFORE mode, mode re-asserted as HEIGHT', () => {
		const steps = planRestore(makeSnapshot({ textAutoResize: 'HEIGHT' }));
		expect(kinds(steps)).toEqual(['set-characters', 'resize', 'set-auto-resize', 'set-truncation', 'set-position', 'set-align']);
		expect(steps.find((s) => s.kind === 'set-auto-resize')).toMatchObject({ mode: 'HEIGHT' });
	});

	it('WIDTH_AND_HEIGHT → set mode only, NO resize (the box re-derives)', () => {
		const steps = planRestore(makeSnapshot({ textAutoResize: 'WIDTH_AND_HEIGHT' }));
		expect(kinds(steps)).not.toContain('resize');
		expect(steps.find((s) => s.kind === 'set-auto-resize')).toMatchObject({ mode: 'WIDTH_AND_HEIGHT' });
	});

	it('TRUNCATE (legacy) → NO resize AND NO mode write (the value cannot be written back)', () => {
		const steps = planRestore(makeSnapshot({ textAutoResize: 'TRUNCATE' }));
		expect(kinds(steps)).not.toContain('resize');
		expect(kinds(steps)).not.toContain('set-auto-resize');
		// characters restore is still sufficient for a legacy fixed box
		expect(kinds(steps)[0]).toBe('set-characters');
	});

	it('emits set-max-lines only when the captured truncation is ENDING', () => {
		const ending = planRestore(makeSnapshot({ textTruncation: 'ENDING', maxLines: 2 }));
		const maxLinesStep = ending.find((s) => s.kind === 'set-max-lines');
		expect(maxLinesStep).toMatchObject({ maxLines: 2 });

		const disabled = planRestore(makeSnapshot({ textTruncation: 'DISABLED', maxLines: 5 }));
		expect(kinds(disabled)).not.toContain('set-max-lines');
	});

	it('preserves a null maxLines under ENDING (fixed-size truncation with no line cap)', () => {
		const steps = planRestore(makeSnapshot({ textTruncation: 'ENDING', maxLines: null }));
		expect(steps.find((s) => s.kind === 'set-max-lines')).toMatchObject({ maxLines: null });
	});

	it('always ends by restoring position then alignment', () => {
		const steps = planRestore(makeSnapshot({ x: 7, y: 9, textAlignHorizontal: 'RIGHT', textAlignVertical: 'CENTER' }));
		expect(steps[steps.length - 2]).toEqual({ kind: 'set-position', x: 7, y: 9 });
		expect(steps[steps.length - 1]).toEqual({ kind: 'set-align', horizontal: 'RIGHT', vertical: 'CENTER' });
	});

	it('inInstance → characters ONLY (geometry/layout is not overridable on an instance child)', () => {
		// Any op reaching an instance child is a char-writing op (the layout op is blocked on
		// `inInstance`), so `characters` is the only property that can differ. Writing x/y/resize would
		// throw "cannot be overridden in an instance" and restore nothing that changed.
		const steps = planRestore(makeSnapshot({ textAutoResize: 'NONE', textTruncation: 'ENDING', maxLines: 2 }), {
			inInstance: true,
		});
		expect(steps).toEqual([{ kind: 'set-characters', characters: 'Hello' }]);
	});

	it('inInstance:false is the default and restores the full property set', () => {
		expect(kinds(planRestore(makeSnapshot({ textAutoResize: 'NONE' }), { inInstance: false }))).toContain('set-position');
		expect(kinds(planRestore(makeSnapshot({ textAutoResize: 'NONE' })))).toContain('set-position');
	});
});
