// src/common/messages.fixtures.ts
//
// Exactly one canonical value per message type (all 15), each with a distinct `id`. The single
// source of truth for "one of every type," shared by the pure unit tests (messages.test.ts) and
// the in-Figma round-trip command (__test:roundtrip). Adding a message type without adding a
// fixture here fails the coverage assertion in messages.test.ts.
import type { AnyMessage } from './messages';

export const fixtures: readonly AnyMessage[] = [
	// ── UI → main (10) ──
	{ type: 'scan-request', id: 'fx-scan-request', scope: 'page' },
	{ type: 'extraction-request', id: 'fx-extraction-request', scope: 'selection' },
	{ type: 'overflow-scan-request', id: 'fx-overflow-scan-request', scope: 'page', targetLanguages: ['de'] },
	{
		type: 'apply-pseudoloc',
		id: 'fx-apply-pseudoloc',
		scope: 'selection',
		options: { expansionPct: 40, accent: true, brackets: true },
	},
	{ type: 'revert-pseudoloc', id: 'fx-revert-pseudoloc' },
	{ type: 'apply-rtl-mirror', id: 'fx-apply-rtl-mirror', scope: 'page' },
	{ type: 'revert-rtl-mirror', id: 'fx-revert-rtl-mirror' },
	{
		type: 'apply-preview',
		id: 'fx-apply-preview',
		translations: { language: 'de', entries: [{ key: 'home.title', value: 'Startseite' }] },
	},
	{ type: 'revert-preview', id: 'fx-revert-preview' },
	{ type: 'select-node', id: 'fx-select-node', nodeId: '1:2' },

	// ── main → UI (5) ──
	{
		type: 'scan-result',
		id: 'fx-scan-result',
		nodes: [
			{
				nodeId: '1:2',
				characters: 'Home',
				containerLabel: 'home / header',
				hasMissingFont: false,
				isMixedFont: false,
				inInstance: false,
				locked: false,
				hidden: false,
				empty: false,
			},
		],
	},
	{
		type: 'extraction-result',
		id: 'fx-extraction-result',
		entries: [{ key: 'home.title', nodeId: '1:2', value: 'Home' }],
	},
	{
		type: 'overflow-scan-result',
		id: 'fx-overflow-scan-result',
		verdicts: [
			{
				nodeId: '1:2',
				language: 'de',
				verdict: 'overflows',
				severity: 'error',
				reason: 'exceeds-fixed-box',
				characters: 'Save',
				containerLabel: 'home / header',
				candidate: 'SaveSaveSav',
				measuredWidth: 86,
				measuredHeight: 19,
			},
		],
	},
	{ type: 'progress', id: 'fx-progress', completed: 3, total: 3, note: 'done' },
	{
		type: 'error',
		id: 'fx-error',
		code: 'nodes-blocked',
		severity: 'warning',
		message: 'Some nodes were skipped.',
		blocked: [{ nodeId: '1:2', reason: 'missing-font' }],
	},
];
