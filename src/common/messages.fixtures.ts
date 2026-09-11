// src/common/messages.fixtures.ts
//
// Exactly one canonical value per message type (all 18), each with a distinct `id`. The single
// source of truth for "one of every type," shared by the pure unit tests (messages.test.ts) and
// the in-Figma round-trip command (__test:roundtrip). Adding a message type without adding a
// fixture here fails the coverage assertion in messages.test.ts.
import type { AnyMessage } from './messages';

export const fixtures: readonly AnyMessage[] = [
	// ── UI → main (12) ──
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
	{ type: 'overflow-scan-cancel', id: 'fx-overflow-scan-cancel' },
	{ type: 'resize-window', id: 'fx-resize-window', width: 400, height: 680 },

	// ── main → UI (6) ──
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
		entries: [{ key: 'home.title', nodeId: '1:2', value: 'Home', drifted: false }],
		blocked: [{ nodeId: 'I4:5;6:7', reason: 'instance-locked' }],
	},
	{
		// One chunk, not the running total — the UI accumulates across partials (LS-8.2 §1.2).
		type: 'overflow-scan-partial',
		id: 'fx-overflow-scan-partial',
		verdicts: [
			{
				nodeId: '1:3',
				language: 'de',
				verdict: 'truncates',
				severity: 'warn',
				reason: 'maxLines-cap',
				characters: 'Continue to checkout',
				containerLabel: 'checkout / summary',
				candidate: 'ContinuetocheckoutContinuetocheckoutConti',
				measuredWidth: 320,
				measuredHeight: 48,
				overflowPx: 16,
			},
		],
	},
	{
		type: 'overflow-scan-result',
		id: 'fx-overflow-scan-result',
		stopped: false,
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
				// measuredWidth/Height are the unlocked read; overflowPx is the constrained one.
				// They are deliberately not commensurable — see models.ts.
				measuredWidth: 86,
				measuredHeight: 19,
				overflowPx: 50,
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
