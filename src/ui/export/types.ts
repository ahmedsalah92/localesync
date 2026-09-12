// src/ui/export/types.ts — the shapes LS-6 owns (docs/specs/LS-6.md §1.3).
//
// `ExtractedString` is consumed from src/common/models.ts and never redefined here (§4).

export type ExportFormat = 'json' | 'ios' | 'android';

export interface ExportOptions {
	format: ExportFormat;
	/** Collapse identical values to one shared key. Default false (spec §2.4.19). */
	dedup: boolean;
}

/**
 * A key the file does not carry verbatim. Populated ONLY where a transform or a format constraint
 * forced it, so an empty array is the common case and a non-empty one is worth surfacing.
 */
export interface KeyMapEntry {
	nodeId: string;
	/** The LS-9 key. */
	from: string;
	/** What the file actually carries. */
	to: string;
	reason: 'android-remap-collision' | 'dedup';
}

/** A key omitted from the file entirely (spec §2.1.2). */
export interface OmittedEntry {
	nodeId: string;
	key: string;
	reason: 'json-prefix-collision';
}

export interface ExportResult {
	/** The file's exact bytes, as text. */
	content: string;
	filename: string;
	mimeType: string;
	keyMap: KeyMapEntry[];
	omitted: OmittedEntry[];
}
