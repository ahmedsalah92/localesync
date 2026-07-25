// src/main/snapshot/types.ts — OWNED by LS-4. Main-thread module, but pure data only: no `figma`
// access, no bridge import, so the pure seams in ./plan (and their Vitest suite) can pull these in
// without a plugin runtime. `TextNode[...]` here is a TYPE reference only (erased at runtime).
//
// The durable snapshot/restore contract (spec §1). Downstream mutating features (LS-10 pseudo-loc,
// LS-11 RTL mirror, LS-12 preview) consume this via ./index; they never redeclare it.
import type { BlockReason, BlockedNode } from '../../common/models'; // owned upstream — never redeclared here

export type { BlockReason, BlockedNode };

/** The three Phase-1 canvas-mutating ops that route through the snapshot primitive. */
export type MutationOp = 'pseudoloc' | 'rtl-mirror' | 'preview';

export const SNAPSHOT_KEY = 'localesync:snapshot:v1'; // setPluginData key per node
export const MANIFEST_KEY = 'localesync:mutation-manifest:v1'; // clientStorage key
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

// 100 kB is the hard pluginData entry cap (agent-guidelines §2); 90 kB leaves headroom for the
// pluginId + key that also count against it. Checked BEFORE mutating (Resolved Defaults §7).
export const SNAPSHOT_MAX_BYTES = 90_000;

// The writable subset of textAutoResize: legacy 'TRUNCATE' is read-only (agent-guidelines §2), so a
// restore step that assigns the mode can never carry it — enforced at the type level.
export type WritableAutoResize = Exclude<TextNode['textAutoResize'], 'TRUNCATE'>;

/** Everything the three Phase-1 ops can change, captured before the first mutation. Closed set
 *  (Resolved Defaults §9): a new op that writes an uncaptured property expands this in place. */
export interface TextNodeSnapshot {
	schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
	nodeId: string;
	op: MutationOp;
	characters: string;
	textAutoResize: TextNode['textAutoResize']; // incl. legacy 'TRUNCATE' — preserved on read, never written
	textTruncation: TextNode['textTruncation'];
	maxLines: number | null; // meaningful only when textTruncation === 'ENDING'
	width: number;
	height: number;
	x: number;
	y: number;
	textAlignHorizontal: TextNode['textAlignHorizontal'];
	textAlignVertical: TextNode['textAlignVertical'];
	capturedAt: number; // Date.now()
}

/** The clientStorage record of what is (or was) in flight, keyed by nodeId. Presence of an entry
 *  is the restore-on-launch signal (Design model §3). */
export type Manifest = Record<string, { op: MutationOp; capturedAt: number }>;

/** Derivable from LS-3's TextNodeModel or from a live TextNode; keeps eligibility pure. */
export interface EligibilityFlags {
	hasMissingFont: boolean;
	isMixedFont: boolean;
	inInstance: boolean;
	empty: boolean;
}

export interface RestoreResult {
	nodeId: string;
	restored: boolean;
	reason?: string;
}

export interface BatchResult {
	succeeded: string[]; // node ids mutated and durably recorded
	blocked: BlockedNode[]; // skipped up front, never touched — feeds the 'nodes-blocked' error message
	failed: { nodeId: string; error: string }[]; // attempted, rolled back
}

export type SnapshotErrorCode = 'MISSING_FONT' | 'PERSIST_FAILED' | 'NODE_GONE' | 'RESTORE_FAILED';

export class SnapshotError extends Error {
	readonly code: SnapshotErrorCode;
	readonly nodeId: string;
	constructor(code: SnapshotErrorCode, nodeId: string, message?: string) {
		super(message ?? `${code} on node ${nodeId}`);
		this.name = 'SnapshotError';
		this.code = code;
		this.nodeId = nodeId;
	}
}

// The restore-order PLAN as data (Resolved Defaults §3, "Pure seams"). planRestore() emits this
// from a snapshot; a thin impure applier in ./index executes it. Modelling it as data is what lets
// the resize-before-mode ordering be unit-tested with no `figma` runtime.
export type RestoreStep =
	| { readonly kind: 'set-characters'; readonly characters: string }
	| { readonly kind: 'resize'; readonly width: number; readonly height: number }
	| { readonly kind: 'set-auto-resize'; readonly mode: WritableAutoResize }
	| { readonly kind: 'set-truncation'; readonly textTruncation: TextNode['textTruncation'] }
	| { readonly kind: 'set-max-lines'; readonly maxLines: number | null }
	| { readonly kind: 'set-position'; readonly x: number; readonly y: number }
	| {
			readonly kind: 'set-align';
			readonly horizontal: TextNode['textAlignHorizontal'];
			readonly vertical: TextNode['textAlignVertical'];
	  };
