// src/ui/pseudo/PseudoPanel.test.ts — the panel mounts and carries its designed controls.
//
// Same technique and rationale as devtools/DevHarness.test.ts and export/ExportModal.test.ts:
// rendered rather than source-scanned, so it fails on a real regression (a throwing component, a
// control deleted) rather than on a reformat, and `react-dom/server` keeps it in Vitest's plain
// Node environment with no jsdom (agent-guidelines §6). It proves the surface is in the tree and
// mounts; the canvas mutation itself is the §3.3 in-Figma harness's job.
import { createElement } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ACCENTS, EXPANSIONS, LABELS, MARKERS, STATES } from './copy';

let markup = '';

beforeAll(async () => {
	// `src/ui/bridge.ts` claims a `window` 'message' listener at module scope and the panel pulls it
	// in. Stub before the dynamic imports below; static imports would be hoisted above this.
	vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });

	const [{ renderToStaticMarkup }, { PseudoPanel }, { AppliedProvider }] = await Promise.all([
		import('react-dom/server'),
		import('./PseudoPanel'),
		import('../shell/applied'),
	]);
	// The panel drives the plugin-wide applied banner, so it must mount inside the provider —
	// `useApplied` throws outside one, which is LS-5 encoding the requirement as a runtime fact.
	markup = renderToStaticMarkup(createElement(AppliedProvider, null, createElement(PseudoPanel)));
});

describe('PseudoPanel', () => {
	it('opens on the designed first-run state, not an empty row list', () => {
		expect(markup).toContain(STATES.firstRun.headline);
		expect(markup).toContain('data-state="first-run"');
	});

	it('carries the three option selects DES-2 built', () => {
		for (const option of [...EXPANSIONS, ...ACCENTS, ...MARKERS]) expect(markup).toContain(option.label);
	});

	it('names each select for a screen reader, since all three show bare positional values', () => {
		for (const name of [LABELS.expansion, LABELS.accent, LABELS.markers]) {
			expect(markup).toContain(`aria-label="${name}"`);
		}
	});

	it('defaults to +40% / full accents / double markers', () => {
		// `selected` marks the chosen <option> in server-rendered markup.
		expect(markup).toMatch(/<option[^>]*value="40"[^>]*selected/);
		expect(markup).toMatch(/<option[^>]*value="full"[^>]*selected/);
		expect(markup).toMatch(/<option[^>]*value="double"[^>]*selected/);
	});

	it('offers an explicit Apply rather than applying on select change', () => {
		expect(markup).toContain(`>${LABELS.apply}<`);
	});

	// The canvas carries neither, and `panels.tsx` registers `pseudo` with no Pro stub (LS-5 §2.2).
	it('renders no summary bar and no Pro footer', () => {
		expect(markup).not.toContain('Translate');
		expect(markup).not.toContain('Report');
	});

	it('shows no applied banner before anything is applied', () => {
		expect(markup).not.toContain('Pseudo-loc: expansion');
		expect(markup).not.toContain('Revert');
	});
});
