import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

/**
 * Smoke check: the dev harness is actually reachable in a DEV build.
 *
 * This exists because the harness went missing once and nobody noticed for six weeks — long enough
 * for `fixtures/overflow-spike.fig` to go un-regenerated while the fixed-box false positive shipped
 * (LS-8.2 §5 carry-forward 5). The failure mode that matters is not any one CSS rule: it is that a
 * dev-only affordance can disappear *silently*, because nothing renders it in CI and no user
 * complains about a missing dev button. One assertion closes that whole category.
 *
 * Rendered rather than source-scanned, so it fails on a real regression — `<DevHarness />` deleted
 * from `Shell`, the gate inverted, or the harness throwing on mount — instead of on a reformat.
 *
 * `react-dom/server` is used deliberately: it runs in Vitest's plain Node environment, so this adds
 * no jsdom and no testing-library (agent-guidelines §6 keeps Vitest to logic that needs no browser).
 * It renders markup, not layout — so it proves the harness is in the tree and mounts, and cannot
 * prove it is on-screen. Visual reachability is the §3.4 canvas review's job.
 */

let markup = '';

beforeAll(async () => {
	// `src/ui/bridge.ts` claims a `window` 'message' listener at module scope, and `Shell` pulls it
	// in transitively (panels → OverflowPanel → bridge). Stub before the dynamic imports below;
	// static imports would be hoisted above this.
	vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });

	const [{ renderToStaticMarkup }, { Shell }] = await Promise.all([
		import('react-dom/server'),
		import('../shell/Shell'),
	]);
	markup = renderToStaticMarkup(createElement(Shell));
});

describe('DevHarness reachability in DEV builds', () => {
	it('runs under a DEV-flagged env, so the gate below is the one that ships to dev', () => {
		expect(import.meta.env.DEV).toBe(true);
	});

	it('is rendered by Shell', () => {
		expect(markup).toContain('<details');
		expect(markup).toContain('>dev</summary>');
	});

	it('carries the acceptance buttons the fixture workflow depends on', () => {
		for (const label of [
			'__test:roundtrip',
			'__test:traversal',
			'Run LS-4 snapshot check',
			'Run LS-8 overflow check',
			'Run LS-9 extract check',
			'Resize probe 100x100',
			'Clear window size',
			'Generate overflow-spike',
			'Generate extract-keys',
			'Generate large-file',
			// LS-18 / FIX-2: without this the 42 export cases never reach a canvas, so Gleef cannot
			// be run over them and the goldens lose their anchor.
			'Generate export-cases',
		]) {
			expect(markup).toContain(label);
		}
	});

	// The harness is pinned out of flow on purpose: the §3.4 canvas review runs under `npm run dev`,
	// and an in-flow dev band would sit between the reviewer and the thing being reviewed. Out of
	// flow is also what keeps it immune to the shell's column layout — no sibling's `flex: 1` can
	// collapse it.
	it('is positioned out of flow rather than laid out as a shell sibling', () => {
		expect(markup).toMatch(/<details[^>]*style="[^"]*position:fixed/);
	});
});
