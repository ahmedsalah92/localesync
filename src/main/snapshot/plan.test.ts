// src/main/snapshot/plan.test.ts — pure unit tests (no `figma`, no DOM). Imports the pure seams
// only; ./index pulls in the `figma` global (loadFontAsync, clientStorage) and cannot load under
// Vitest. Every case derives from LS-4 spec §2 (Resolved Defaults) and §3 (Concrete Acceptance).
import { describe, expect, it } from 'vitest';
import {
	deserializeSnapshot,
	isRecognizedSchema,
	mergeManifest,
	mutationBlockReason,
	planLayoutRestore,
	planRestore,
	ownerOp,
	removeFromManifest,
	serializeSnapshot,
} from './plan';
import { snapshotKind } from './types';
import type { EligibilityFlags, LayoutSnapshot, Manifest, MutationOp, RestoreStep, TextNodeSnapshot } from './types';

const OPS: MutationOp[] = ['pseudoloc', 'preview', 'rtl-mirror'];

function flags(overrides: Partial<EligibilityFlags> = {}): EligibilityFlags {
	return {
		hasMissingFont: false,
		isMixedFont: false,
		inInstance: false,
		empty: false,
		alreadyMutated: false,
		...overrides,
	};
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

	// LS-10 §1.2. Without this row a second apply captures the already-transformed text as the
	// original and the real one is gone for good, so it is blocked for every op.
	it('blocks an already-mutated node for every op', () => {
		for (const op of OPS) expect(mutationBlockReason(flags({ alreadyMutated: true }), op)).toBe('already-mutated');
	});

	describe('precedence — first matching row wins, top-to-bottom', () => {
		it('already-mutated outranks every other flag, for every op', () => {
			// A mutated node's font/empty state describes the mutation, not the original — reporting
			// one of those reasons would be describing the wrong text.
			const all = flags({
				alreadyMutated: true,
				hasMissingFont: true,
				empty: true,
				isMixedFont: true,
				inInstance: true,
			});
			for (const op of OPS) expect(mutationBlockReason(all, op)).toBe('already-mutated');
		});

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
	it('NONE → resize BEFORE mode (resizeWithoutConstraints resets textAutoResize, so re-assert it)', () => {
		const steps = planRestore(makeSnapshot({ textAutoResize: 'NONE' }));
		expect(kinds(steps)).toEqual([
			'set-characters',
			'resize',
			'set-auto-resize',
			'set-truncation',
			'set-position',
			'set-align',
		]);
		const resizeAt = kinds(steps).indexOf('resize');
		const modeAt = kinds(steps).indexOf('set-auto-resize');
		expect(resizeAt).toBeLessThan(modeAt);
		expect(steps[modeAt]).toMatchObject({ mode: 'NONE' });
	});

	it('HEIGHT → resize BEFORE mode, mode re-asserted as HEIGHT', () => {
		const steps = planRestore(makeSnapshot({ textAutoResize: 'HEIGHT' }));
		expect(kinds(steps)).toEqual([
			'set-characters',
			'resize',
			'set-auto-resize',
			'set-truncation',
			'set-position',
			'set-align',
		]);
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
		const steps = planRestore(
			makeSnapshot({ x: 7, y: 9, textAlignHorizontal: 'RIGHT', textAlignVertical: 'CENTER' }),
		);
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
		expect(kinds(planRestore(makeSnapshot({ textAutoResize: 'NONE' }), { inInstance: false }))).toContain(
			'set-position',
		);
		expect(kinds(planRestore(makeSnapshot({ textAutoResize: 'NONE' })))).toContain('set-position');
	});
});

// ── LS-11's layout arm ─────────────────────────────────────────────────────────
function layoutSnapshot(overrides: Partial<LayoutSnapshot> = {}): LayoutSnapshot {
	return {
		schemaVersion: 1,
		kind: 'layout',
		nodeId: 'n:1',
		op: 'rtl-mirror',
		x: 10,
		y: 20,
		capturedAt: 0,
		...overrides,
	};
}

describe('planLayoutRestore — only plans what was actually captured (LS-11 §1.2)', () => {
	// The guard that matters: a VECTOR has no `layoutMode` and a non-grid child has no anchors.
	// Planning a step for an absent field would make restore throw on a perfectly ordinary node.
	it('emits nothing layout-ish for a bare node', () => {
		expect(
			kinds(planLayoutRestore(layoutSnapshot({ layoutPositioning: 'AUTO', parentLayoutMode: 'HORIZONTAL' }))),
		).toEqual([]);
	});

	it('emits a step per captured field, and only those', () => {
		const steps = planLayoutRestore(
			layoutSnapshot({
				layoutMode: 'HORIZONTAL',
				primaryAxisAlignItems: 'MIN',
				counterAxisAlignItems: 'CENTER',
				paddingLeft: 16,
				paddingRight: 8,
				itemReverseZIndex: false,
				childOrder: ['a', 'b', 'c'],
			}),
		);
		// No parentLayoutMode captured means no auto-layout parent, so `x` is authored and restored.
		expect(kinds(steps)).toEqual([
			'set-layout-align',
			'set-padding',
			'set-item-reverse-z',
			'set-x',
			'set-child-order',
		]);
	});

	// Re-inserting children re-derives every child's x in an auto-layout frame, so a position write
	// before it would be overwritten and one after it would fight the layout.
	it('restores child order LAST', () => {
		const steps = planLayoutRestore(
			layoutSnapshot({
				layoutPositioning: 'ABSOLUTE',
				parentLayoutMode: 'HORIZONTAL',
				childOrder: ['a', 'b'],
				paddingLeft: 1,
				paddingRight: 2,
			}),
		);
		const order = kinds(steps);
		expect(order[order.length - 1]).toBe('set-child-order');
		expect(kinds(steps)).toContain('set-x');
	});

	it('writes x only for a node its parent does not lay out', () => {
		// Absolutely positioned: x is authored, so it must be restored.
		expect(
			kinds(planLayoutRestore(layoutSnapshot({ layoutPositioning: 'ABSOLUTE', layoutMode: 'NONE' }))),
		).toContain('set-x');
		// An auto-layout child's x is derived by the parent — writing it back would fight the layout.
		expect(
			kinds(planLayoutRestore(layoutSnapshot({ layoutPositioning: 'AUTO', parentLayoutMode: 'HORIZONTAL' }))),
		).not.toContain('set-x');
	});

	/**
	 * Grid positions are a PARENT fact, captured for the whole grid at once. Per child they could not
	 * be restored at all: `setGridChildPosition` throws on a transient overlap, so putting a reversed
	 * permutation back one member at a time collides on its first write.
	 */
	it('plans one parent-level step for the whole grid, after child order', () => {
		const withGrid = planLayoutRestore(
			layoutSnapshot({
				parentLayoutMode: 'GRID',
				gridChildHorizontalAlign: 'MIN',
				childOrder: ['a', 'b'],
				gridChildPositions: [
					{ childId: 'a', row: 0, column: 2 },
					{ childId: 'b', row: 0, column: 0 },
				],
			}),
		);
		expect(kinds(withGrid)).toContain('set-grid-align');
		const order = kinds(withGrid);
		expect(order[order.length - 1]).toBe('set-grid-positions');
		expect(order.indexOf('set-child-order')).toBeLessThan(order.indexOf('set-grid-positions'));
	});

	/**
	 * The staged grid write widens the grid to twice its width. If a write throws in between, the
	 * grid is left widened — and without the width in the snapshot, rollback put every child back
	 * but left the user's grid permanently double-width. Restored LAST, once children are home.
	 */
	it('restores the grid width after its children, so an interrupted staging heals', () => {
		const steps = planLayoutRestore(
			layoutSnapshot({ gridColumnCount: 3, gridChildPositions: [{ childId: 'a', row: 0, column: 0 }] }),
		);
		expect(steps[steps.length - 1]).toEqual({ kind: 'set-grid-column-count', value: 3 });
		expect(kinds(steps).indexOf('set-grid-positions')).toBeLessThan(kinds(steps).indexOf('set-grid-column-count'));
	});

	it('plans no grid step for a node that is not a grid', () => {
		expect(kinds(planLayoutRestore(layoutSnapshot({ paddingLeft: 1, paddingRight: 2 })))).not.toContain(
			'set-grid-positions',
		);
	});
});

describe('planRestore dispatch and backward compatibility', () => {
	it('routes a layout snapshot to the layout arm', () => {
		expect(
			kinds(planRestore(layoutSnapshot({ paddingLeft: 4, paddingRight: 0, parentLayoutMode: 'VERTICAL' }))),
		).toEqual(['set-padding']);
	});

	it('routes a text snapshot to the text arm', () => {
		expect(kinds(planRestore(makeSnapshot()))).toContain('set-characters');
	});

	/**
	 * Pre-LS-11 snapshots were written with no `kind` and are sitting in real users' pluginData right
	 * now. They must still restore as text — this is why `kind` was added as optional rather than
	 * bumping SNAPSHOT_SCHEMA_VERSION and forcing a migration.
	 */
	it('treats a snapshot with no `kind` as text', () => {
		const legacy = makeSnapshot();
		delete (legacy as { kind?: unknown }).kind;
		expect(snapshotKind(legacy)).toBe('text');
		expect(kinds(planRestore(legacy))).toContain('set-characters');
	});

	it('round-trips a layout snapshot through serialize/deserialize', () => {
		const snapshot = layoutSnapshot({ childOrder: ['a', 'b'], paddingLeft: 3, paddingRight: 9 });
		expect(deserializeSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot);
	});
});

// LS-34: which op owns the snapshot on THIS node. Instances inherit a copy of their main
// component's plugin data, carrying the main component's nodeId (LS-11 §2.11) — that copy is not
// this node's snapshot and must read as null.
describe('ownerOp — the op of a node’s own snapshot', () => {
	const snap = (op: string, nodeId: string) => JSON.stringify({ schemaVersion: 1, nodeId, op, characters: 'x' });

	it.each(['preview', 'pseudoloc', 'rtl-mirror'])('returns %s for the node’s own snapshot', (op) => {
		expect(ownerOp(snap(op, '1:2'), '1:2')).toBe(op);
	});

	it('ignores a copy inherited from another node', () => {
		expect(ownerOp(snap('preview', '9:9'), '1:2')).toBeNull();
	});

	it.each(['', 'not json', '{"nodeId":"1:2"}', '{"nodeId":"1:2","op":"bogus"}'])('reads %j as no owner', (raw) => {
		expect(ownerOp(raw, '1:2')).toBeNull();
	});
});
