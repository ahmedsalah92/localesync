# LS-13 Telemetry + Paid-Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the four Pro stubs to open the waitlist in the browser with per-pillar UTM tags, and add a typed activation-event emitter, called once at each core action's success. It uses a console sink in dev and a no-op sink in production. There is no network access.

**Architecture:**
- **Shared:** `src/common/pro.ts` builds the waitlist URL, and is imported by both sides.
- **Main thread:** `src/main/telemetry.ts` owns `openExternal` and two first-run flags in `clientStorage`.
- **UI:** `src/ui/telemetry.ts` owns the event union and the one sink line.
- **Shell:** a new `ProStub` component replaces `FooterStub`.
- **Messages:** four new message types on the typed bridge.

**Tech Stack:** TypeScript, React, Vitest, Figma Plugin API (`figma.openExternal`, `clientStorage`).

**Spec:** `docs/specs/LS-13.md`, the binding authority.

**Precondition:** LS-34 Part 4 (`ls-34-polish`) must be merged to `main` first. This plan edits
`PreviewPanel.tsx`, `PseudoPanel.tsx`, `ExportModal.tsx` and `Shell.tsx`, and describes them as they
are after that merge. Before Task 1, rebase `ls-13-telemetry` onto the new `main`.

## Global Constraints
- **Checks:** every commit keeps `npx tsc -b`, `npx eslint .` and `npm test` green. Before the last
  commit, also run `npm run build`, which still passes with the placeholder (D6), and
  `npm run check:docs`.
- **Main thread** has no DOM, Node or `Intl`, and uses `figma.getNodeByIdAsync` only. The
  `figma.openExternal(url: string): void` pin is in plugin-api.d.ts:346. There is no `figma.openURL`.
- **Messages** go through `src/common/messages.ts` only: the typed union plus the compile-checked
  `Record` allow-lists.
- **Styling:** no hex; `--ls-*` tokens and `--spacer-*` spacing; UI3 icons only.
- **Formatting:** Prettier on `.ts`/`.tsx`/`.mjs` you touch; never on `.md`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- **Exact values** (spec D1 and §1.3/§2.3):
  - `WAITLIST_URL = 'https://example.invalid/waitlist'`
  - query `?utm_source=figma&utm_medium=plugin&utm_campaign=pro-waitlist&utm_content=<pillar>`
  - labels: `matrix` "Scan all languages at once", `report` "Export QA report", `translate` "Translate with AI", `sync` "Sync with your team"
  - tooltip "Coming soon in Pro. Opens the waitlist in your browser. LocaleSync doesn't send any data from the plugin."
  - `clientStorage` key `localesync:telemetry:v1`

## Review Focus
1. **`install` fires once, even when launch-time storage fails.** If the flags read or write
   rejects, the plugin must still work: telemetry is best-effort and never shows an error.
2. **`preview_used` only counts a language the user picked.** It must not count the automatic
   re-apply after an import or a failed edit (spec §2.2).
3. **`first_scan` fires at most once,** even when two scans complete before the main thread has
   saved the flag. The module-level flag covers it.
4. **Clicking a Pro stub twice quickly opens two tabs.** That's acceptable, but it must never throw
   or leave a pending state.
5. **The four `utm_content` values stay distinct and exact.** A typo here silently merges two
   pillars' signal.

---

### Task 1: Contracts: `pro.ts` and the four message types

**Files:**
- Create: `src/common/pro.ts`, `src/common/pro.test.ts`
- Modify: `src/common/messages.ts`, `src/common/messages.fixtures.ts`, `src/common/roundtrip.ts`,
  `src/common/messages.test.ts`

**Interfaces (produces):** `ProPillar`, `WAITLIST_URL`, `WAITLIST_PLACEHOLDER_HOST`, `PRO_LABEL`,
`waitlistUrl(pillar)`; message types `OpenWaitlist {pillar}`, `TelemetryMark {flag:'first-scan'}`,
`TelemetryStateRequest`, `TelemetryState {firstLaunch, firstScanDone}`; and
`RequestResponse['telemetry-state-request'] = TelemetryState`.

- [ ] **Step 1: Failing tests.** Create `src/common/pro.test.ts`:

```ts
// src/common/pro.test.ts — the waitlist handoff (LS-13 §1.3, D1). Pure.
import { describe, expect, it } from 'vitest';
import { PRO_LABEL, WAITLIST_URL, waitlistUrl, type ProPillar } from './pro';

describe('waitlistUrl', () => {
	it.each(['matrix', 'report', 'translate', 'sync'] as ProPillar[])('tags %s distinctly', (pillar) => {
		expect(waitlistUrl(pillar)).toBe(
			`${WAITLIST_URL}?utm_source=figma&utm_medium=plugin&utm_campaign=pro-waitlist&utm_content=${pillar}`,
		);
	});

	// Review Focus 5 — four distinct signals, never merged.
	it('gives each pillar its own URL', () => {
		const urls = (['matrix', 'report', 'translate', 'sync'] as ProPillar[]).map(waitlistUrl);
		expect(new Set(urls).size).toBe(4);
	});

	it('is the same for every call — no per-user part', () => {
		expect(waitlistUrl('sync')).toBe(waitlistUrl('sync'));
	});
});

describe('PRO_LABEL — the canvas copy', () => {
	it('matches the four Pro Stub instances', () => {
		expect(PRO_LABEL).toEqual({
			matrix: 'Scan all languages at once',
			report: 'Export QA report',
			translate: 'Translate with AI',
			sync: 'Sync with your team',
		});
	});
});
```

  In `src/common/messages.test.ts`, add `'open-waitlist'`, `'telemetry-mark'` and
  `'telemetry-state-request'` to its `UI_TO_MAIN` list, and `'telemetry-state'` to `MAIN_TO_UI`.

- [ ] **Step 2: Run, and confirm it fails.** Run: `npx vitest run src/common`. Expected: FAIL,
  because `./pro` doesn't exist and the fixture coverage no longer matches.

- [ ] **Step 3: Implement `src/common/pro.ts`.**

```ts
// src/common/pro.ts — the Pro waitlist handoff (LS-13 §1.3). Pure; imported by main and UI.
//
// A browser navigation, not a fetch: the main thread opens this URL with figma.openExternal, the
// landing page's Umami records the visit, and the plugin itself sends nothing — so it ships with
// `allowedDomains: ["none"]` (agent-guidelines §2).

export type ProPillar = 'matrix' | 'report' | 'translate' | 'sync';

/** D2 placeholder until the waitlist exists. `.invalid` is reserved: it can never resolve.
 *  `npm run check:release` refuses to pass while this is still in the bundle (D6). */
export const WAITLIST_URL = 'https://example.invalid/waitlist';
export const WAITLIST_PLACEHOLDER_HOST = 'example.invalid';

export const PRO_LABEL: Record<ProPillar, string> = {
	matrix: 'Scan all languages at once',
	report: 'Export QA report',
	translate: 'Translate with AI',
	sync: 'Sync with your team',
};

/** One distinct `utm_content` per pillar (D1), so the four intent signals stay separable in Umami.
 *  No user, file or version part — identical for every user. */
export function waitlistUrl(pillar: ProPillar): string {
	return `${WAITLIST_URL}?utm_source=figma&utm_medium=plugin&utm_campaign=pro-waitlist&utm_content=${pillar}`;
}
```

- [ ] **Step 4: Messages.** In `src/common/messages.ts`:
  - `import type { ProPillar } from './pro';`
  - Add the four types exactly as in spec §1.2, with short comments.
  - Add `OpenWaitlist | TelemetryMark | TelemetryStateRequest` to `UiToMain`, and `TelemetryState` to
    `MainToUi`.
  - Add `'telemetry-state-request': TelemetryState;` to `RequestResponse`, and
    `'telemetry-state-request': 'telemetry-state',` to `RESPONSE_TYPE`.
  - Add all four to the `Record` allow-lists.

  In `messages.fixtures.ts`, add one fixture per new type and bump the header counts:
  - `{ type: 'open-waitlist', id: 'fx-open-waitlist', pillar: 'matrix' }`
  - `{ type: 'telemetry-mark', id: 'fx-telemetry-mark', flag: 'first-scan' }`
  - `{ type: 'telemetry-state-request', id: 'fx-telemetry-state-request' }`
  - `{ type: 'telemetry-state', id: 'fx-telemetry-state', firstLaunch: false, firstScanDone: true }`

  In `roundtrip.ts` `PROBED_COMMANDS`, add
  `'open-waitlist': false, // opens a real browser tab; never probe` and
  `'telemetry-mark': false, // writes the user's clientStorage`.

- [ ] **Step 5: Verify.** Run: `npx prettier --write src/common/*.ts && npx vitest run src/common && npx tsc -b && npx eslint . && npm test`. Expected: PASS.

- [ ] **Step 6: Commit.** Commit with `git commit -m "LS-13: waitlist URL builder and telemetry message contracts"`, ending with the co-author line.

---

### Task 2: Main thread: `openExternal`, first-run flags, and the dev "Clear telemetry flags" button

**Files:**
- Create: `src/main/telemetry.ts`, `src/main/telemetry-flags.ts`, `src/main/telemetry-flags.test.ts`
- Modify: `src/main/main.ts`, `src/ui/devtools/DevHarness.tsx`, `src/ui/devtools/DevHarness.test.ts`

**Interfaces:** `parseTelemetryFlags(raw: unknown): { installed: boolean; firstScanDone: boolean }`
and `TELEMETRY_KEY` in the pure file; `registerTelemetry(): void` in `telemetry.ts`.

- [ ] **Step 1: Failing test.** Create `src/main/telemetry-flags.test.ts`:

```ts
// src/main/telemetry-flags.test.ts — pure (no figma).
import { describe, expect, it } from 'vitest';
import { TELEMETRY_KEY, parseTelemetryFlags } from './telemetry-flags';

describe('parseTelemetryFlags — clientStorage is a cache', () => {
	it('reads stored flags', () => {
		expect(parseTelemetryFlags({ installed: true, firstScanDone: false })).toEqual({ installed: true, firstScanDone: false });
	});

	it.each([undefined, null, 'x', 3, { installed: 'yes' }, { firstScanDone: 1 }])('reads %j as a fresh user', (raw) => {
		expect(parseTelemetryFlags(raw)).toEqual({ installed: false, firstScanDone: false });
	});

	it('uses the versioned key', () => {
		expect(TELEMETRY_KEY).toBe('localesync:telemetry:v1');
	});
});
```

- [ ] **Step 2: Run, and confirm it fails.** Run: `npx vitest run src/main/telemetry-flags.test.ts`. Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Implement.** Create `src/main/telemetry-flags.ts`:

```ts
// src/main/telemetry-flags.ts — first-run memory for LS-13's install / first_scan events. Pure.
export const TELEMETRY_KEY = 'localesync:telemetry:v1';

export interface TelemetryFlags {
	installed: boolean;
	firstScanDone: boolean;
}

/** Anything malformed reads as a fresh user: telemetry is best-effort and never throws. */
export function parseTelemetryFlags(raw: unknown): TelemetryFlags {
	if (typeof raw !== 'object' || raw === null) return { installed: false, firstScanDone: false };
	const { installed, firstScanDone } = raw as Record<string, unknown>;
	return { installed: installed === true, firstScanDone: firstScanDone === true };
}
```

  Create `src/main/telemetry.ts`:

```ts
// src/main/telemetry.ts — LS-13 main-thread handlers: the waitlist handoff and first-run flags.
//
// Telemetry is best-effort (spec §1.5): a clientStorage failure never surfaces as an error the UI
// must handle. The one real failure — openExternal throwing — answers `internal`.
import { waitlistUrl } from '../common/pro';
import { on, respond, send } from './bridge';
import { TELEMETRY_KEY, parseTelemetryFlags, type TelemetryFlags } from './telemetry-flags';

async function readFlags(): Promise<TelemetryFlags> {
	try {
		return parseTelemetryFlags(await figma.clientStorage.getAsync(TELEMETRY_KEY));
	} catch {
		return { installed: false, firstScanDone: false };
	}
}

async function writeFlags(flags: TelemetryFlags): Promise<void> {
	try {
		await figma.clientStorage.setAsync(TELEMETRY_KEY, flags);
	} catch (err) {
		if (import.meta.env.DEV) console.warn(`[telemetry] flags not saved: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export function registerTelemetry(): void {
	on('telemetry-state-request', (msg) => {
		void (async () => {
			const flags = await readFlags();
			if (!flags.installed) await writeFlags({ ...flags, installed: true });
			respond<'telemetry-state-request'>(msg.id, {
				type: 'telemetry-state',
				firstLaunch: !flags.installed,
				firstScanDone: flags.firstScanDone,
			});
		})();
	});

	on('telemetry-mark', (msg) => {
		void (async () => {
			const flags = await readFlags();
			await writeFlags({ ...flags, firstScanDone: true });
			send({ type: 'progress', id: msg.id, completed: 1, total: 1 });
		})();
	});

	on('open-waitlist', (msg) => {
		try {
			figma.openExternal(waitlistUrl(msg.pillar));
			send({ type: 'progress', id: msg.id, completed: 1, total: 1 });
		} catch (err) {
			send({
				type: 'error',
				id: msg.id,
				code: 'internal',
				severity: 'error',
				message: `Couldn't open the waitlist: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
}
```

  **Check before relying on it:** read `src/main/env.d.ts` or `vite-env` to confirm
  `import.meta.env.DEV` is typed on the main thread. `main.ts` already uses it, so it should be.

- [ ] **Step 4: Register it, and add the dev button.** In `src/main/main.ts`:
  - `import { registerTelemetry } from './telemetry';`
  - call `registerTelemetry();` directly after `registerPreview();`
  - in the DEV `__dev:` sentinel block, add `__dev:clear-telemetry-flags`, which awaits
    `figma.clientStorage.deleteAsync(TELEMETRY_KEY)` and logs `[dev] telemetry flags cleared`. Copy
    the shape of the existing `__dev:resize-clear-size` block and import `TELEMETRY_KEY`.

  In `src/ui/devtools/DevHarness.tsx`, add a button "Clear telemetry flags" posting
  `{ type: '__dev:clear-telemetry-flags' }`, following the existing buttons. Add the label to
  `DevHarness.test.ts`'s list first and watch it fail.

- [ ] **Step 5: Verify.** Run: `npx prettier --write src/main/telemetry*.ts src/main/main.ts src/ui/devtools/*.ts* && npx tsc -b && npx eslint . && npm test && npm run build`. Expected: PASS, and `check:dist` OK: the dev button's `__dev:` string must not reach `dist/`.

- [ ] **Step 6: Commit.** Commit with `git commit -m "LS-13: main-thread waitlist handoff and first-run telemetry flags"`, ending with the co-author line.

---

### Task 3: UI emitter (`src/ui/telemetry.ts`)

**Files:** Create `src/ui/telemetry.ts`, `src/ui/telemetry.test.ts`.

**Interfaces (produces):** `TelemetryEvent`, `Sink`, `noopSink`, `consoleSink`, `SINK`,
`track(event, sink?)`, `firstScanAction(done)`, `setFirstScanDone(done)`,
`markFirstScan(kind, deps?)`.

- [ ] **Step 1: Failing test.** Create `src/ui/telemetry.test.ts`:

```ts
// src/ui/telemetry.test.ts — the activation emitter (LS-13 §1.4). Pure; no bridge.
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { firstScanAction, markFirstScan, setFirstScanDone, track, type TelemetryEvent } from './telemetry';

describe('track', () => {
	it('hands the event to the sink exactly once', () => {
		const sink = vi.fn();
		track({ name: 'export_performed', format: 'json' }, sink);
		expect(sink).toHaveBeenCalledTimes(1);
		expect(sink).toHaveBeenCalledWith({ name: 'export_performed', format: 'json' });
	});

	it('carries only closed literal properties — no free text (no PII)', () => {
		expectTypeOf<Extract<TelemetryEvent, { name: 'pseudoloc_applied' }>['expansion']>().toEqualTypeOf<30 | 40 | 50>();
		expectTypeOf<Extract<TelemetryEvent, { name: 'export_performed' }>['format']>().toEqualTypeOf<'json' | 'ios' | 'android'>();
		expectTypeOf<Extract<TelemetryEvent, { name: 'preview_used' }>>().toEqualTypeOf<{ name: 'preview_used' }>();
	});
});

describe('first_scan — once, ever', () => {
	it('decides fire vs skip from the stored flag', () => {
		expect(firstScanAction(false)).toBe('fire');
		expect(firstScanAction(true)).toBe('skip');
	});

	// Review Focus 3 — two scans completing before main persists the flag still fire once.
	it('fires once across repeated completions and marks the main thread once', () => {
		setFirstScanDone(false);
		const sink = vi.fn();
		const mark = vi.fn();
		markFirstScan('overflow', { sink, mark });
		markFirstScan('extract', { sink, mark });
		expect(sink).toHaveBeenCalledTimes(1);
		expect(sink).toHaveBeenCalledWith({ name: 'first_scan', kind: 'overflow' });
		expect(mark).toHaveBeenCalledTimes(1);
	});

	it('never fires when the user already scanned in an earlier session', () => {
		setFirstScanDone(true);
		const sink = vi.fn();
		markFirstScan('extract', { sink, mark: vi.fn() });
		expect(sink).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run, and confirm it fails.** Run: `npx vitest run src/ui/telemetry.test.ts`. Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Implement `src/ui/telemetry.ts`.** It must **not** import `./bridge` at module
  level, because the test runs in plain Node. The real `mark` is injected by the caller.

```ts
// src/ui/telemetry.ts — LS-13 activation events (spec §1.4, §2.2).
//
// Every value is a closed literal: no keys, names, language codes or ids — no PII. Phase 1 sends
// to a console sink in dev and a no-op sink in production; a real collector is the SINK line (§2.5).
export type TelemetryEvent =
	| { name: 'install' }
	| { name: 'first_scan'; kind: 'extract' | 'overflow' }
	| { name: 'overflow_scan_run'; scope: 'page' | 'selection' }
	| { name: 'pseudoloc_applied'; expansion: 30 | 40 | 50 }
	| { name: 'rtl_applied'; scope: 'page' | 'selection' }
	| { name: 'preview_used' }
	| { name: 'export_performed'; format: 'json' | 'ios' | 'android' };

export type Sink = (event: TelemetryEvent) => void;
export const noopSink: Sink = () => {};
export const consoleSink: Sink = (event) => console.log('[telemetry]', event);

/** THE one line to change for a real collector (spec §2.5). */
export const SINK: Sink = import.meta.env.DEV ? consoleSink : noopSink;

/** `sink` is a test seam only; call sites never pass it. */
export function track(event: TelemetryEvent, sink: Sink = SINK): void {
	sink(event);
}

let firstScanDone = true; // until the launch-time state answers, assume done: never a false first_scan

/** Set from the launch-time `telemetry-state` answer. */
export function setFirstScanDone(done: boolean): void {
	firstScanDone = done;
}

export function firstScanAction(done: boolean): 'fire' | 'skip' {
	return done ? 'skip' : 'fire';
}

/** Fire `first_scan` once, ever: module state guards this session before main persists the mark. */
export function markFirstScan(kind: 'extract' | 'overflow', deps: { sink?: Sink; mark: () => void }): void {
	if (firstScanAction(firstScanDone) === 'skip') return;
	firstScanDone = true;
	track({ name: 'first_scan', kind }, deps.sink);
	deps.mark();
}
```

  Callers pass `mark: () => send<TelemetryMark>({ type: 'telemetry-mark', flag: 'first-scan' })`.
  When `deps.sink` is `undefined`, `track` falls back to `SINK`. Double-check that the default
  parameter kicks in for an explicit `undefined`; it does in JS.

- [ ] **Step 4: Verify.** Run: `npx prettier --write src/ui/telemetry*.ts && npx vitest run src/ui/telemetry.test.ts && npx tsc -b && npx eslint . && npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** Commit with `git commit -m "LS-13: typed activation-event emitter with a swappable sink"`, ending with the co-author line.

---

### Task 4: `ProStub`, replacing `FooterStub`

**Files:**
- Create: `src/ui/shell/ProStub.tsx`, `src/ui/shell/ProStub.test.ts`
- Modify: `src/ui/overflow/OverflowPanel.tsx`, `src/ui/extract/ExtractPanel.tsx`,
  `src/ui/preview/PreviewPanel.tsx`, `src/ui/rtl/RtlPanel.tsx`
- Delete: `src/ui/shell/FooterStub.tsx`

**Interfaces:** `ProStub(props: { pillar: ProPillar; onOpen?: (pillar: ProPillar) => void })`. The
default `onOpen` sends `open-waitlist`. It's injectable so the render test needn't load the bridge;
if `../bridge` loads fine under Vitest, as `PseudoPanel.test.ts` suggests, a default import is fine.

- [ ] **Step 1: Failing test.** Create `src/ui/shell/ProStub.test.ts` (render with
  `react-dom/server`, the same pattern as `ExportModal.test.ts`):
  - For each pillar, the markup contains `PRO_LABEL[pillar]`, the text `Pro` (the badge), exactly
    one `<button`, and
    `aria-label="${PRO_LABEL[pillar]} — Coming soon in Pro. Opens the waitlist in your browser. LocaleSync doesn't send any data from the plugin."`.
  - The markup contains no hex colour: `expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i)`.

- [ ] **Step 2: Run, and confirm it fails.** Run: `npx vitest run src/ui/shell/ProStub.test.ts`. Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Implement `ProStub.tsx`.**
  - **Container:** a `<button type="button">`: `height: BAND_HEIGHT`, full width, `flexShrink: 0`,
    `display: flex`, `alignItems: center`, `justifyContent: space-between`, and the same padding as
    `FooterStub` (`0 var(--spacer-3)`).
  - **Separator:** a 1px top border in `var(--ls-border-default)`.
  - **Background:** `transparent`, with `var(--ls-bg-hover)` on hover.
  - **Left side:** the label span (text tokens like `FooterStub`, but `--ls-text-default`) and the
    badge: a span "Pro" with `border: 1px solid var(--ls-border-brand)`,
    `color: var(--ls-text-brand)`, `borderRadius: var(--radius-small)`, `padding: 0 var(--spacer-1)`,
    and a `gap: var(--spacer-2)` between them.
  - **Right side:** `<ArrowIcon />` in `var(--ls-icon-secondary)`.
  - **Wrapping:** the whole button sits inside the existing `Tooltip`, labelled with the tooltip copy.
  - **Copy:** put the constant tooltip text in `src/ui/shell/copy.ts`, or a new `proCopy` const in
    the component file if there's no shell copy module, as `PRO_TOOLTIP`.
  - **Token check:** before using `--ls-border-brand` and `--ls-border-default`, verify each exists
    in `src/ui/styles.css`. If `--ls-border-brand` is missing, add it to the alias layer as
    `var(--figma-color-border-brand)` and to agent-guidelines §7's vocabulary. That's the same
    procedure LS-12 used for `--ls-border-selected`.
- [ ] **Step 4: Place it.**
  - **OverflowPanel:** `<FooterStub name={LABELS.footer} />` becomes `<ProStub pillar="matrix" />`.
  - **ExtractPanel:** it becomes `<ProStub pillar="report" />`.
  - **PreviewPanel:** `<FooterStub name="Translate" />` becomes `<ProStub pillar="translate" />`.
  - **RtlPanel:** render `<ProStub pillar="sync" />` after the `ResultsList` in every state, matching
    how PreviewPanel renders its stub. Change its `ResultsList hasFooter={false}` to `hasFooter` so
    the scroll-clearance rule (LS-8.2 §2.2) accounts for the band.
  - **Unused copy:** remove `LABELS.footer` from the Overflow and Extract copy only if nothing else
    uses it. Update copy tests that assert it.
  - **Delete `FooterStub.tsx`.**

- [ ] **Step 5: Verify.** Run: `npx prettier --write src/ui/shell/ProStub* src/ui/*/*Panel.tsx && npx vitest run src/ui && npx tsc -b && npx eslint . && npm test`. Expected: PASS.

- [ ] **Step 6: Commit.** Commit with `git commit -m "LS-13: Pro stubs open the waitlist; RTL gains its Sync stub"`, ending with the co-author line.

---

### Task 5: Call sites (activation events and launch state)

**Files:** Modify `Shell.tsx`, `OverflowPanel.tsx`, `ExtractPanel.tsx`, `PseudoPanel.tsx`,
`RtlPanel.tsx`, `PreviewPanel.tsx`, `ExportModal.tsx`.

Panels can't render under Vitest, so this task's proof is `tsc` plus the manual §3.3 checks. The
decision logic is already tested in Task 3. Record that as a ledger ruling.

- [ ] **Step 1: Launch** (`Shell.tsx`, in `ShellBody`). Add a `useEffect(() => { … }, [])`:

```ts
	// LS-13 §2.4: once per launch. Best-effort — a failure never blocks the plugin.
	useEffect(() => {
		request('telemetry-state-request', {}).then(
			(state) => {
				setFirstScanDone(state.firstScanDone);
				if (state.firstLaunch) track({ name: 'install' });
			},
			() => {},
		);
	}, []);
```

  Import `request` from `../bridge`, and `track` and `setFirstScanDone` from `../telemetry`.
- [ ] **Step 2: Overflow.** In its result handler (`dispatch({ kind: 'result', … })`), after the
  dispatch:

```ts
				if (result.stopped !== true) {
					track({ name: 'overflow_scan_run', scope: state.scope });
					markFirstScan('overflow', { mark: () => send<TelemetryMark>({ type: 'telemetry-mark', flag: 'first-scan' }) });
				}
```

  Check the closure: `state.scope` must be the scope the scan was **started** with. Capture it
  before `requestWithId` (`const scope = state.scope;`) and use `scope`.
- [ ] **Step 3: Extract.** After its result dispatch:
  `markFirstScan('extract', { mark: () => send<TelemetryMark>({ type: 'telemetry-mark', flag: 'first-scan' }) });`.
- [ ] **Step 4: Pseudo-loc.** Inside the success callback, next to `dispatch({ kind: 'applied', … })`:
  `track({ name: 'pseudoloc_applied', expansion: state.options.expansionPct as 30 | 40 | 50 });`.
  Check that `PseudoLocOptions.expansionPct`'s real type allows only 30/40/50. If it's plain
  `number`, narrow it with a small guard rather than a bare cast, and record a ruling.
- [ ] **Step 5: RTL.** In the progress handler's `wasApply` branch, after the dispatch:
  `track({ name: 'rtl_applied', scope: scopeRef.current });`.
- [ ] **Step 6: Preview** (Review Focus 2). Add `const userApply = useRef(false);`.
  - Set it `true` in the dropdown's `onChange`, before `apply(v)`.
  - In the progress handler, where `op === 'apply'` succeeds, run:
    `if (userApply.current) track({ name: 'preview_used' }); userApply.current = false;`.
  - Automatic re-applies (after an import, after a failed edit) leave it `false`, so they're not
    counted. Try Again after a failed user apply **does** count, because it's a user action: set
    `userApply.current = true` in that handler too.
- [ ] **Step 7: Export.** In `ExportModal`'s `onDownload`, after `downloadExport(result);`:
  `track({ name: 'export_performed', format });`.
- [ ] **Step 8: Verify.** Run: `npx prettier --write` on the touched files, then `npx tsc -b && npx eslint . && npm test && npm run build`. Expected: PASS.

- [ ] **Step 9: Commit.** Commit with `git commit -m "LS-13: activation events at each core action's success"`, ending with the co-author line.

---

### Task 6: Release guard and docs

**Files:**
- Create: `scripts/check-release.mjs`, `scripts/find-placeholder.mjs`,
  `src/common/find-placeholder.test.ts`. A Vitest test can import a `.mjs` file by relative path;
  if `tsconfig` complains, keep the pure helper as `src/common/findPlaceholder.ts` and have the
  script read the built files itself.
- Modify: `package.json`, `CLAUDE.md`, `AGENTS.md`, `docs/design.md`

- [ ] **Step 1: Failing test** of a pure `findPlaceholder(text: string): boolean`. It returns true
  when `text` contains `example.invalid`, and false for `https://localesync.app/waitlist`.
- [ ] **Step 2: Implement.**
  - **`scripts/check-release.mjs`:**
    1. run `npm run build` through `child_process.execSync`, so `dist/` is fresh;
    2. read `dist/main.js` and `dist/ui.html`;
    3. if either contains `WAITLIST_PLACEHOLDER_HOST`, print
       `check:release — FAIL: dist/<file> still links the placeholder waitlist (example.invalid). Set WAITLIST_URL in src/common/pro.ts.`
       and exit 1;
    4. otherwise print `check:release — OK`.

    Copy the style of `scripts/check-dist.mjs`.
  - **`package.json`:** add `"check:release": "node scripts/check-release.mjs"`. **Don't** add it to
    `build` or `postbuild`, and don't add it to `.github/workflows/ci.yml` (D6).
- [ ] **Step 3: Docs.**
  - **CLAUDE.md and AGENTS.md "Commands":** add the same line to both, verbatim: "- `npm run check:release` — pre-publish only: fails while the Pro waitlist URL is still the `example.invalid` placeholder (LS-13 D6). Not part of CI." Run `npm run check:docs`.
  - **`design.md`:** under "🔲 To be done", add "**LS-13 — Pro stub tooltip.** Draw the tooltip on a Pro Stub: \"Coming soon in Pro. Opens the waitlist in your browser. LocaleSync doesn't send any data from the plugin.\" The RTL Sync stub is now built in code, matching `351:1411`."
- [ ] **Step 4: Verify.** Run: `npx tsc -b && npx eslint . && npm test && npm run build && npm run check:docs`. Expected: all pass. Then run `npm run check:release`: expected FAIL, naming `example.invalid`, with exit code 1. That failure is correct and proves the guard.
- [ ] **Step 5: Commit.** Commit with `git commit -m "LS-13: release-only waitlist placeholder guard; docs"`, ending with the co-author line.
