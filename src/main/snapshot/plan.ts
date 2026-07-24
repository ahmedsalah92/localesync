// src/main/snapshot/plan.ts — OWNED by LS-4. Pure seams: no `figma` access, no bridge import, so
// the Vitest suite (./plan.test.ts) runs without a plugin runtime. Everything here is a total
// function over plain data — the eligibility table, snapshot (de)serialization, manifest algebra,
// and the restore-order plan. The impure applier that touches live nodes lives in ./index.
import type { BlockReason } from '../../common/models';
import { SNAPSHOT_SCHEMA_VERSION } from './types';
import type { EligibilityFlags, Manifest, MutationOp, RestoreStep, TextNodeSnapshot } from './types';

// Deterministic eligibility table (Resolved Defaults §1), rows checked top-to-bottom; the first
// match wins. Mirrors the spec table 1:1 so the precedence (missing-font before empty before
// mixed-font before instance-locked) is data, not control flow.
interface EligibilityRow {
	flag: keyof EligibilityFlags;
	reason: BlockReason;
	blockedFor: readonly MutationOp[];
}

const ELIGIBILITY_TABLE: readonly EligibilityRow[] = [
	{ flag: 'hasMissingFont', reason: 'missing-font', blockedFor: ['pseudoloc', 'preview', 'rtl-mirror'] },
	{ flag: 'empty', reason: 'empty', blockedFor: ['pseudoloc', 'preview', 'rtl-mirror'] },
	// char-writing ops flatten per-range styling on a mixed-font node; rtl-mirror is layout-only, safe.
	{ flag: 'isMixedFont', reason: 'mixed-font-char-mutation', blockedFor: ['pseudoloc', 'preview'] },
	// instance children accept `characters` overrides but cannot be repositioned — only layout blocks.
	{ flag: 'inInstance', reason: 'instance-locked', blockedFor: ['rtl-mirror'] },
];

/** Pure. Op × flags → the reason this node must NOT be mutated, or null if eligible. */
export function mutationBlockReason(flags: EligibilityFlags, op: MutationOp): BlockReason | null {
	for (const row of ELIGIBILITY_TABLE) {
		if (flags[row.flag] && row.blockedFor.includes(op)) return row.reason;
	}
	return null;
}

export function serializeSnapshot(snapshot: TextNodeSnapshot): string {
	return JSON.stringify(snapshot);
}

/** Parse a stored snapshot. Never throws on an unrecognized schemaVersion — the caller does a
 *  best-effort restore of the fields present (Resolved Defaults §7); malformed JSON is the caller's
 *  to guard (getPluginData returns '' for an absent key). */
export function deserializeSnapshot(json: string): TextNodeSnapshot {
	return JSON.parse(json) as TextNodeSnapshot;
}

export function isRecognizedSchema(snapshot: { schemaVersion?: unknown }): boolean {
	return snapshot.schemaVersion === SNAPSHOT_SCHEMA_VERSION;
}

/** Merge a batch delta over the current manifest (later entries win). Non-mutating. */
export function mergeManifest(base: Manifest, delta: Manifest): Manifest {
	return { ...base, ...delta };
}

/** Drop every listed id from the manifest. Idempotent — removing an absent id is a no-op. */
export function removeFromManifest(base: Manifest, nodeIds: readonly string[]): Manifest {
	const next: Manifest = { ...base };
	for (const id of nodeIds) delete next[id];
	return next;
}

/** The per-mode restore step sequence (Resolved Defaults §3). The resize/mode branching encodes the
 *  `resizeWithoutConstraints`-resets-textAutoResize gotcha (agent-guidelines §2):
 *    NONE / HEIGHT       → resize THEN set mode (re-derive the box, then re-assert the mode);
 *    WIDTH_AND_HEIGHT    → set mode only (the box re-derives; a resize would be overwritten);
 *    TRUNCATE (legacy)   → neither (the mode cannot be written back; characters restore suffices).
 *  maxLines is emitted only when the captured truncation is 'ENDING'. */
export function planRestore(snapshot: TextNodeSnapshot): RestoreStep[] {
	const steps: RestoreStep[] = [{ kind: 'set-characters', characters: snapshot.characters }];

	switch (snapshot.textAutoResize) {
		case 'NONE':
		case 'HEIGHT':
			steps.push({ kind: 'resize', width: snapshot.width, height: snapshot.height });
			steps.push({ kind: 'set-auto-resize', mode: snapshot.textAutoResize });
			break;
		case 'WIDTH_AND_HEIGHT':
			steps.push({ kind: 'set-auto-resize', mode: 'WIDTH_AND_HEIGHT' });
			break;
		case 'TRUNCATE':
			// legacy, read-only: no resize, no mode write.
			break;
	}

	steps.push({ kind: 'set-truncation', textTruncation: snapshot.textTruncation });
	if (snapshot.textTruncation === 'ENDING') {
		steps.push({ kind: 'set-max-lines', maxLines: snapshot.maxLines });
	}
	steps.push({ kind: 'set-position', x: snapshot.x, y: snapshot.y });
	steps.push({
		kind: 'set-align',
		horizontal: snapshot.textAlignHorizontal,
		vertical: snapshot.textAlignVertical,
	});
	return steps;
}
