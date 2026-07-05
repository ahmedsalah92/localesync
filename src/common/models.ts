// src/common/models.ts
//
// Plain-data shapes that cross the postMessage bridge. Each is OWNED by the feature spec named
// in its banner and lives here ONLY because it must (a) be structured-clone-serializable and
// (b) be importable by BOTH threads — and src/common is the one place both sides can import.
// When the owning spec is written, it EXPANDS its type in place here. Never fork a second copy
// (agent-guidelines §4): a missing field is fixed upstream, here, not by redefining downstream.

// ── owned by LS-3 (traversal) — expand here, do not fork ──
// Serializable projection of LS-3's TextNodeModel: only the fields the UI results list and
// jump-to-node need. The live model (fonts as FontName | typeof figma.mixed, container refs)
// stays main-side; LS-3 maps it to this DTO when it answers a scan.
export interface ScannedTextNode {
	nodeId: string;
	characters: string;
	containerLabel: string; // display path, e.g. "home / header"
	hasMissingFont: boolean;
	isMixedFont: boolean;
	inInstance: boolean;
	locked: boolean;
	hidden: boolean;
	empty: boolean;
}

// ── owned by LS-9 (extraction) — expand here, do not fork ──
// Shape matches the `ExtractedString` the LS-6 export spec imports; this is the one definition
// both LS-6 (ui) and LS-9 (main) share. If LS-9's panel needs `duplicateOf`, add it HERE.
export interface ExtractedString {
	key: string;
	nodeId: string;
	value: string;
}

// ── owned by LS-8 (overflow, post-LS-7) — expand here, do not fork ──
// The `verdict` vocabulary is PROVISIONAL: it encodes the brief §4 per-mode definitions, but the
// measurement spike (LS-7) and LS-8 tighten it. Widen/narrow this union HERE when LS-8 lands.
export interface OverflowVerdict {
	nodeId: string;
	language: string;
	verdict: 'fits' | 'clips' | 'overflows' | 'truncates' | 'unmeasurable';
	severity?: 'warn' | 'error';
}

// ── owned by LS-4 (snapshot) — expand here, do not fork ──
// Reason a node was NOT mutated. The LS-4 example declares this in src/main/snapshot; it is
// RELOCATED here because the `error` message carries it across the bridge (see upstream note).
// LS-4 imports BlockReason from common rather than declaring it.
export type BlockReason = 'missing-font' | 'mixed-font-char-mutation' | 'instance-locked' | 'empty';

export interface BlockedNode {
	nodeId: string;
	reason: BlockReason;
}

// ── owned by LS-10 (pseudo-loc) — expand here, do not fork ──
export interface PseudoLocOptions {
	expansionPct: number; // e.g. 30–50
	accent: boolean;
	brackets: boolean;
}

// ── owned by LS-12 (preview) — expand here, do not fork ──
// Translations parsed UI-side from JSON/CSV, keyed to LS-9 keys. Main resolves key→node and
// reports keys that match nothing (LS-12 success criterion).
export interface PreviewMap {
	language: string;
	entries: { key: string; value: string }[];
}
