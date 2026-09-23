# LS-28 RTL Change Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the RTL Mirror panel's review list with a change summary: how many layers were mirrored, which icons moved and need a direction check, and which layers were skipped and why. Moved and skipped groups expand to rows you can jump to.

**Architecture:** All of the numbers already reach the UI. The one data change is an optional `name` on LS-4's `BlockedNode`, so skipped layers can be listed by name. The work is split into small pure functions, each tested in Vitest:
- `summarize` (in `state.ts`) turns the reducer state into groups.
- `groupCopy` (in `copy.ts`) turns a group into its text.
- `summaryRows` (new `rows.ts`) turns the groups plus the expansion state into a flat list of rows.

`RtlPanel.tsx` just maps those rows onto `ResultsRow`, which gains optional `expanded` and `depth` props and an optional jump.

**Tech Stack:** TypeScript, React (Plugma/Vite), Vitest (plain Node, `react-dom/server` for render tests), Figma Plugin API (main thread only).

**Spec:** `docs/specs/LS-28.md` (read it first). The upstream specs are `docs/specs/LS-11.md` (the panel) and `docs/specs/LS-4.md` (the snapshot primitive).

## Global Constraints

- Every commit keeps `npx tsc -b`, `npx eslint .` and `npm test` green. CI also runs `npm run build` and `npm run check:docs`.
- `src/main/*` has no DOM and no Node. Use only the `figma` global.
- No hex literals on the plugin surface. Colours come from `--ls-*` alias tokens and spacing from `--spacer-*`: `--spacer-3` = 16px, `--spacer-5` = 32px.
- Icons are UI3 components only (`ChevronRightIcon`, `ChevronDownIcon`, `ArrowIcon`). No typographic glyphs.
- `src/ui/rtl/state.ts` must never import `../bridge`, because its tests run in plain Node.
- Copy, verbatim (spec §2.2):

  | Group | Row text (singular / plural) | Second line | `RowTone` |
  |---|---|---|---|
  | mirrored | `1 layer mirrored` / `N layers mirrored` | `layout flipped right-to-left` | `neutral` |
  | moved | `1 icon moved` / `N icons moved` | `check direction` | `truncates` |
  | skipped, `instance-locked` | `1 layer skipped` / `N layers skipped` | `inside a component instance` | `unmeasurable` |
  | skipped, `missing-font` | same as above | `font unavailable` | `unmeasurable` |
  | skipped, `already-mutated` | same as above | `Preview or Pseudo-loc is active` | `unmeasurable` |
  | skipped, `empty` | same as above | `empty layer` | `unmeasurable` |

  The fallback child name is `Unnamed layer`.
- Group order: mirrored, moved, `instance-locked`, `missing-font`, `already-mutated`, `empty`. Groups with no nodes are left out. The mirrored group always appears after an apply, even at 0.
- Default expansion is `['moved']`, reset on every apply and on revert.
- The `BlockedNode.name` change touches LS-4's primitive, so **the PR needs human review before merge**. Say so in the PR body.

## Review Focus

1. **A `BlockedNode` with no `name`, or with `name: ''` or only whitespace** (older producers, or a layer the user left unnamed). The row should read `Unnamed layer` and never show a blank line. Pinned in Task 5.
2. **A `mixed-font-char-mutation` block reaching the RTL panel.** The eligibility table never blocks `rtl-mirror` for this reason, but `BlockReason` allows it. `summarize` should drop it quietly: no row, no crash. Pinned in Task 3.
3. **Re-applying after a revert.** The mirrored count from the previous run must not show while the new run is in flight, and expansion must reset. Pinned in Task 3.
4. **The same `nodeId` appearing twice in the rows** (as a group child, and in a duplicated upstream list). Row ids must stay unique so React keys don't collide: prefix them with the group key. Pinned in Task 5.
5. **An apply where every layer was skipped.** The mirrored row reads `0 layers mirrored` (plural at zero) and still comes first. Pinned in Task 4 (copy) and Task 3 (order).

---

### Task 1: `BlockedNode.name` (LS-4 upstream amendment)

**Files:**
- Modify: `src/common/models.ts:90-93` (the `BlockedNode` interface)
- Modify: `src/main/snapshot/index.ts:371` (the only `result.blocked.push`)
- Modify: `src/main/rtl/check.ts` (after the `instance-locked` note, around line 288)
- Modify: `docs/specs/LS-4.md` (add an amendment note at the end of §2 Resolved Defaults, just before `## 3. Concrete Acceptance`)

**Interfaces:**
- Produces: `BlockedNode { nodeId: string; reason: BlockReason; name?: string }`. Every node that `withSnapshot` blocks now carries `name: node.name`.

This is main-thread code that Vitest cannot run (agent-guidelines §6). The test for it is the in-Figma harness assertion added in Step 3.

- [ ] **Step 1: Widen the type**

In `src/common/models.ts`, replace:

```ts
export interface BlockedNode {
	nodeId: string;
	reason: BlockReason;
}
```

with:

```ts
export interface BlockedNode {
	nodeId: string;
	reason: BlockReason;
	/** The layer's name when it was blocked (LS-28 §1.2). Optional so existing producers and fixtures
	 *  stay valid; the RTL panel renders `Unnamed layer` when it is absent. */
	name?: string;
}
```

- [ ] **Step 2: Fill it in at the eligibility gate**

In `src/main/snapshot/index.ts`, inside `withSnapshot`, replace:

```ts
		if (reason !== null) result.blocked.push({ nodeId: node.id, reason });
```

with:

```ts
		// `name` is read-only reporting for the RTL panel's skipped groups (LS-28 §1.2). It cannot
		// affect eligibility, capture or restore.
		if (reason !== null) result.blocked.push({ nodeId: node.id, reason, name: node.name });
```

- [ ] **Step 3: Add the harness assertion (LS-28 §3.4, item 11)**

In `src/main/rtl/check.ts`, directly after this line:

```ts
		else note(notes, 'instance-locked', true, `${instanceLocked.length} instance child(ren) skipped`);
```

insert:

```ts

		// ── [4b] LS-28: every skipped node carries its live name ─────────────────────────────────
		// The panel's skipped groups list layers by name; a missing or stale name renders as
		// "Unnamed layer" and the user cannot find what was skipped.
		if (first.blocked.length === 0) skip(notes, 'blocked-names', 'nothing blocked on this page');
		else {
			const wrong = first.blocked.filter((entry) => entry.name !== targets.get(entry.nodeId)?.name);
			note(
				notes,
				'blocked-names',
				wrong.length === 0,
				`${first.blocked.length - wrong.length}/${first.blocked.length} named correctly`,
			);
		}
```

- [ ] **Step 4: Add the LS-4 amendment note**

In `docs/specs/LS-4.md`, directly above the line `## 3. Concrete Acceptance`, insert:

```markdown
**Amendment (LS-28, 2026-09-23): `BlockedNode.name`.** `withSnapshot`'s eligibility gate now also
records `name: node.name` on every blocked entry, so the RTL panel can list skipped layers by name.
This is read-only reporting. Eligibility, capture, mutation and restore are unchanged, and
`restoreIds` produces no `BlockedNode`. The field is optional, so older producers and fixtures stay
valid. Rationale: `docs/specs/LS-28.md` §1.2.

```

- [ ] **Step 5: Verify**

Run: `npx tsc -b && npx eslint . && npm test`
Expected: all green. `BlockedNode` literals elsewhere (for example `src/common/messages.fixtures.ts:55`) compile unchanged, because `name` is optional.

- [ ] **Step 6: Commit**

```bash
git add src/common/models.ts src/main/snapshot/index.ts src/main/rtl/check.ts docs/specs/LS-4.md
git commit -m "LS-28: BlockedNode carries the layer name (LS-4 amendment)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `ResultsRow` — optional jump, a disclosure chevron, and depth (LS-5 amendment)

**Files:**
- Modify: `src/ui/shell/ResultsRow.tsx`
- Test: `src/ui/shell/ResultsRow.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RowTrailing =
  	| { onJump: () => void; jumpLabel: string; expanded?: never }
  	| { expanded: boolean; onJump?: never; jumpLabel?: never }
  	| { onJump?: never; jumpLabel?: never; expanded?: never };

  export function ResultsRow(props: {
  	tone: RowTone; primary: string; meta: RowMeta; monoMeta?: boolean;
  	selected: boolean; onSelect: () => void; depth?: 0 | 1;
  } & RowTrailing): JSX.Element;
  ```
- The disclosure chevron renders as `<span data-disclosure="open">` when `expanded` is true and `<span data-disclosure="closed">` when it is false. Tests look for that attribute.
- The existing callers (`OverflowPanel`, `PseudoPanel`, `ExtractPanel`, `RtlPanel`) all pass `onJump` and `jumpLabel` and must compile unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/shell/ResultsRow.test.ts`. The first line of the file changes to add `beforeAll`, and two imports are added:

```ts
import { createElement, type FunctionComponent } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { toneToken, type RowTone } from './ResultsRow';
```

Then append:

```ts
// Rendered rather than source-scanned, the same technique as export/ExportModal.test.ts:
// `react-dom/server` keeps it in Vitest's plain Node environment.
describe('ResultsRow trailing slot and depth (LS-28 §1.3)', () => {
	let render: (props: Record<string, unknown>) => string = () => '';

	beforeAll(async () => {
		const [{ renderToStaticMarkup }, { ResultsRow }] = await Promise.all([
			import('react-dom/server'),
			import('./ResultsRow'),
		]);
		// Loosely typed on purpose: the cases below include prop combinations `RowTrailing` rejects at
		// compile time only when written as JSX, and the test is about the rendered output.
		const Row = ResultsRow as unknown as FunctionComponent<Record<string, unknown>>;
		render = (props) => renderToStaticMarkup(createElement(Row, props));
	});

	const base = {
		tone: 'neutral',
		primary: 'Primary',
		meta: { label: 'meta' },
		selected: false,
		onSelect: () => {},
	};

	it('renders the jump button for a row built with today’s props', () => {
		const html = render({ ...base, onJump: () => {}, jumpLabel: 'Jump to node' });
		expect(html).toContain('<button');
		expect(html).not.toContain('data-disclosure');
	});

	it('renders no jump and no chevron when neither is given', () => {
		const html = render(base);
		expect(html).not.toContain('<button');
		expect(html).not.toContain('data-disclosure');
	});

	it('renders the open chevron when expanded, and no jump', () => {
		const html = render({ ...base, expanded: true });
		expect(html).toContain('data-disclosure="open"');
		expect(html).not.toContain('<button');
	});

	it('renders the closed chevron when collapsed', () => {
		expect(render({ ...base, expanded: false })).toContain('data-disclosure="closed"');
	});

	it('insets a depth-1 row by 32px (--spacer-5) and a default row by 16px', () => {
		expect(render({ ...base, depth: 1 })).toContain('var(--spacer-5)');
		expect(render(base)).not.toContain('var(--spacer-5)');
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/shell/ResultsRow.test.ts`
Expected: FAIL. The "no jump and no chevron" case renders a `<button>` (the jump is unconditional today), and the chevron and `--spacer-5` cases find no match.

- [ ] **Step 3: Implement**

In `src/ui/shell/ResultsRow.tsx`:

1. Add the icon imports next to `ArrowIcon`:

```ts
import { ArrowIcon } from './icons/ArrowIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
```

2. Above `export function ResultsRow`, add:

```ts
/**
 * The row's trailing slot (LS-28 §1.3). A union, so a row with both a jump and a disclosure
 * chevron does not compile. Today's rows are the first member and compile unchanged.
 */
export type RowTrailing =
	| { onJump: () => void; jumpLabel: string; expanded?: never }
	| { expanded: boolean; onJump?: never; jumpLabel?: never }
	| { onJump?: never; jumpLabel?: never; expanded?: never };
```

3. Change the signature and the `jumpHover` state. Replace:

```ts
export function ResultsRow(props: {
	tone: RowTone;
	primary: string;
	meta: RowMeta;
	monoMeta?: boolean;
	selected: boolean;
	onSelect: () => void;
	onJump: () => void;
	jumpLabel: string;
}) {
	const tokens = toneToken(props.tone);
	const [jumpHover, setJumpHover] = useState(false);
```

with:

```ts
export function ResultsRow(
	props: {
		tone: RowTone;
		primary: string;
		meta: RowMeta;
		monoMeta?: boolean;
		selected: boolean;
		onSelect: () => void;
		/** 1 → a child row under an expandable group: left content inset 32px instead of 16px. */
		depth?: 0 | 1;
	} & RowTrailing,
) {
	const tokens = toneToken(props.tone);
```

4. Replace the content container's padding line:

```ts
					padding: `var(--spacer-2) var(--spacer-3)`,
```

with:

```ts
					padding: `var(--spacer-2) var(--spacer-3) var(--spacer-2) ${props.depth === 1 ? 'var(--spacer-5)' : 'var(--spacer-3)'}`,
```

5. Replace the whole trailing `<Tooltip label={props.jumpLabel}> … </Tooltip>` block, from the `<Tooltip label={props.jumpLabel}>` line through its closing `</Tooltip>`, including the comment inside it, with:

```tsx
				{props.onJump !== undefined ? (
					<JumpButton onJump={props.onJump} label={props.jumpLabel} />
				) : props.expanded !== undefined ? (
					// Decorative: the whole row is the click target (onSelect). Same resting token as the
					// jump glyph.
					<span
						aria-hidden="true"
						data-disclosure={props.expanded ? 'open' : 'closed'}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 16,
							height: 16,
							flexShrink: 0,
							color: 'var(--ls-icon-secondary)',
						}}
					>
						{props.expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
					</span>
				) : null}
```

6. Below `ResultsRow`, add the extracted jump button. Its body is the removed block, moved unchanged, with `jumpHover` state now local to it:

```tsx
function JumpButton(props: { onJump: () => void; label: string }) {
	const [jumpHover, setJumpHover] = useState(false);
	return (
		<Tooltip label={props.label}>
			{/* Glyph stays at the UI3 16×16 spec — verified against 293:1298, whose `Icon` is a
			    10×10 shape at (3,3), so the export is faithful and is not scaled up. The *hit
			    area* is 24×24 instead, pulled back with a negative margin so the row's layout is
			    unchanged, and hover lifts the icon out of `icon/secondary`. */}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					props.onJump();
				}}
				onMouseEnter={() => setJumpHover(true)}
				onMouseLeave={() => setJumpHover(false)}
				onFocus={() => setJumpHover(true)}
				onBlur={() => setJumpHover(false)}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 24,
					height: 24,
					margin: -4,
					borderRadius: 'var(--radius-small)',
					backgroundColor: jumpHover ? 'var(--ls-bg-hover)' : 'transparent',
					color: jumpHover ? 'var(--ls-icon-default)' : 'var(--ls-icon-secondary)',
					flexShrink: 0,
				}}
			>
				<ArrowIcon />
			</button>
		</Tooltip>
	);
}
```

- [ ] **Step 4: Run the tests, the typecheck and lint**

Run: `npx vitest run src/ui/shell/ResultsRow.test.ts && npx tsc -b && npx eslint .`
Expected: PASS, and `tsc` reports no errors in the four existing callers. If `tsc` fails to narrow `props.jumpLabel` to `string` inside the `onJump !== undefined` branch, the `RowTrailing` members are not being treated as a discriminated union: check that every member declares all three keys, as written above.

- [ ] **Step 5: Commit**

```bash
git add src/ui/shell/ResultsRow.tsx src/ui/shell/ResultsRow.test.ts
git commit -m "LS-28: ResultsRow gains an optional jump, a disclosure chevron and depth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reducer — mirrored count, expansion, `summarize`

**Files:**
- Modify: `src/ui/rtl/state.ts`
- Modify: `src/ui/rtl/RtlPanel.tsx` (one line: the `progressAction` call)
- Test: `src/ui/rtl/state.test.ts`

**Interfaces:**
- Consumes: `BlockedNode` (Task 1), `FlaggedNode`, `BlockReason` from `src/common/models.ts`.
- Produces (exported from `src/ui/rtl/state.ts`):
  ```ts
  export type SkippedReason = Exclude<BlockReason, 'mixed-font-char-mutation'>;
  export type GroupKey = 'moved' | `skipped:${SkippedReason}`;
  export type SummaryGroup =
  	| { kind: 'mirrored'; count: number }
  	| { kind: 'moved'; key: 'moved'; nodes: FlaggedNode[] }
  	| { kind: 'skipped'; key: GroupKey; reason: SkippedReason; nodes: BlockedNode[] };
  export const SKIPPED_ORDER: readonly SkippedReason[]; // ['instance-locked','missing-font','already-mutated','empty']
  // RtlState gains: mirrored: number; expanded: GroupKey[];
  // RtlAction: 'applied' gains `mirrored: number`; new { kind: 'toggle-group'; key: GroupKey }
  export function summarize(state: RtlState): SummaryGroup[];
  export function progressAction(pending: PendingOp, blocked: readonly BlockedNode[], completed: number): RtlAction | null;
  ```
- `selectShell`, `missingFontCount` and the old shell values stay **unchanged in this task**. Task 6 changes them, so every commit compiles.

- [ ] **Step 1: Update the existing tests for the widened `applied` action**

In `src/ui/rtl/state.test.ts`, every `{ kind: 'applied', blocked: … }` literal needs a `mirrored` count. Run:

```bash
sed -i '' -E "s/\{ kind: 'applied', blocked: ([^}]*) \}/{ kind: 'applied', blocked: \1, mirrored: 1 }/g" src/ui/rtl/state.test.ts
sed -i '' "s/{ kind: 'applied', blocked },/{ kind: 'applied', blocked, mirrored: 1 },/" src/ui/rtl/state.test.ts
```

The second command catches the shorthand literal inside the `selectShell` suite's `applied` helper. Check with `grep -n "kind: 'applied'" src/ui/rtl/state.test.ts`: every hit must now carry `mirrored`. The `progressAction` expectations are replaced by hand below. The repo runs `noUncheckedIndexedAccess` and typechecks test files, so a missed literal fails `tsc -b`.

Then update the `progressAction` describe block's expectations and calls to pass and expect the third argument. Replace:

```ts
	it('completes an apply, never a revert', () => {
		expect(progressAction('apply', [])).toEqual({ kind: 'applied', blocked: [] });
	});

	it('completes a revert', () => {
		expect(progressAction('revert', [])).toEqual({ kind: 'reverted' });
	});

	// A progress correlated to nothing we started must not move the panel at all.
	it('ignores a progress we were not waiting on', () => {
		expect(progressAction(null, [])).toBeNull();
	});

	// `nodes-blocked` arrives BEFORE the terminal progress, so the blocked list is carried in.
	it('carries the blocked list collected before the terminal progress', () => {
		const list = [blocked('missing-font')];
		expect(progressAction('apply', list)).toEqual({ kind: 'applied', blocked: list });
	});

	// The reducer's own guarantee, which the stale closure violated end to end: an apply that
	// completes must leave the switch ON.
	it('an applied run leaves the mirror on, a reverted one leaves it off', () => {
		const afterApply = run([{ kind: 'apply-started' }, progressAction('apply', []) as RtlAction]);
		expect(isMirrorOn(afterApply.phase)).toBe(true);
		const afterRevert = run([{ kind: 'revert-started' }, progressAction('revert', []) as RtlAction], afterApply);
		expect(isMirrorOn(afterRevert.phase)).toBe(false);
	});
```

with:

```ts
	it('completes an apply, never a revert', () => {
		expect(progressAction('apply', [], 12)).toEqual({ kind: 'applied', blocked: [], mirrored: 12 });
	});

	it('completes a revert', () => {
		expect(progressAction('revert', [], 12)).toEqual({ kind: 'reverted' });
	});

	// A progress correlated to nothing we started must not move the panel at all.
	it('ignores a progress we were not waiting on', () => {
		expect(progressAction(null, [], 0)).toBeNull();
	});

	// `nodes-blocked` arrives BEFORE the terminal progress, so the blocked list is carried in.
	it('carries the blocked list collected before the terminal progress', () => {
		const list = [blocked('missing-font')];
		expect(progressAction('apply', list, 3)).toEqual({ kind: 'applied', blocked: list, mirrored: 3 });
	});

	// The reducer's own guarantee, which the stale closure violated end to end: an apply that
	// completes must leave the switch ON.
	it('an applied run leaves the mirror on, a reverted one leaves it off', () => {
		const afterApply = run([{ kind: 'apply-started' }, progressAction('apply', [], 1) as RtlAction]);
		expect(isMirrorOn(afterApply.phase)).toBe(true);
		const afterRevert = run([{ kind: 'revert-started' }, progressAction('revert', [], 1) as RtlAction], afterApply);
		expect(isMirrorOn(afterRevert.phase)).toBe(false);
	});
```

- [ ] **Step 2: Write the new failing tests**

Change the import at the top of `src/ui/rtl/state.test.ts` to add `summarize`:

```ts
import {
	initialRtlState,
	isBusy,
	isMirrorOn,
	missingFontCount,
	progressAction,
	rtlReducer,
	selectShell,
	summarize,
} from './state';
```

Then append:

```ts
// ── LS-28: the change summary ─────────────────────────────────────────────────────────────────

const node = (nodeId: string, reason: BlockedNode['reason']): BlockedNode => ({ nodeId, reason, name: nodeId });

/** The spec's fixed state (LS-28 §3.1): 12 mirrored, 3 flagged, instance ×2, font ×1, empty ×1. */
const fixture = (): RtlState =>
	run([
		{ kind: 'apply-started' },
		{ kind: 'flagged', flagged: [flag('1'), flag('2'), flag('3')] },
		{
			kind: 'applied',
			mirrored: 12,
			blocked: [
				node('e', 'empty'),
				node('i1', 'instance-locked'),
				node('f', 'missing-font'),
				node('i2', 'instance-locked'),
			],
		},
	]);

describe('summarize — groups, order, omission (LS-28 §2.1)', () => {
	it('returns every non-empty group in the fixed order', () => {
		const groups = summarize(fixture());
		expect(groups.map((g) => (g.kind === 'mirrored' ? `mirrored:${g.count}` : `${g.key}:${g.nodes.length}`))).toEqual([
			'mirrored:12',
			'moved:3',
			'skipped:instance-locked:2',
			'skipped:missing-font:1',
			'skipped:empty:1',
		]);
	});

	it('keeps the main thread’s node order inside a group', () => {
		const instance = summarize(fixture()).find((g) => g.kind === 'skipped' && g.reason === 'instance-locked');
		expect(instance?.kind === 'skipped' && instance.nodes.map((n) => n.nodeId)).toEqual(['i1', 'i2']);
	});

	// Replaces the old `no-issues` shell: a clean mirror still says what it did.
	it('a clean mirror is just the mirrored row', () => {
		const clean = run([{ kind: 'apply-started' }, { kind: 'applied', blocked: [], mirrored: 12 }]);
		expect(summarize(clean)).toEqual([{ kind: 'mirrored', count: 12 }]);
	});

	// Replaces the old `fonts-unavailable` shell.
	it('a fonts-only run is the mirrored row plus one skipped group', () => {
		const fonts = run([
			{ kind: 'apply-started' },
			{ kind: 'applied', blocked: [node('f', 'missing-font')], mirrored: 5 },
		]);
		expect(summarize(fonts).map((g) => g.kind)).toEqual(['mirrored', 'skipped']);
	});

	it('shows the mirrored row first even when nothing was mirrored', () => {
		const allSkipped = run([
			{ kind: 'apply-started' },
			{ kind: 'applied', blocked: [node('a', 'empty'), node('b', 'empty')], mirrored: 0 },
		]);
		expect(summarize(allSkipped)[0]).toEqual({ kind: 'mirrored', count: 0 });
	});

	it.each(['idle', 'applying', 'reverting', 'failed'] as const)('is empty while %s', (phase) => {
		expect(summarize({ ...fixture(), phase })).toEqual([]);
	});

	// Review Focus 2: never blocked for rtl-mirror, but the type allows it — drop it quietly.
	it('ignores a mixed-font block rather than rendering or crashing', () => {
		const odd = run([
			{ kind: 'apply-started' },
			{ kind: 'applied', blocked: [node('m', 'mixed-font-char-mutation')], mirrored: 1 },
		]);
		expect(summarize(odd)).toEqual([{ kind: 'mirrored', count: 1 }]);
	});
});

describe('expansion (LS-28 §2.3)', () => {
	it('opens the moved group by default', () => {
		expect(initialRtlState().expanded).toEqual(['moved']);
	});

	it('toggle-group opens and closes a group', () => {
		const opened = run([{ kind: 'toggle-group', key: 'skipped:empty' }], fixture());
		expect(opened.expanded).toEqual(['moved', 'skipped:empty']);
		expect(run([{ kind: 'toggle-group', key: 'skipped:empty' }], opened).expanded).toEqual(['moved']);
	});

	it('resets to the default on every apply', () => {
		const fiddled = run(
			[
				{ kind: 'toggle-group', key: 'moved' },
				{ kind: 'toggle-group', key: 'skipped:empty' },
			],
			fixture(),
		);
		expect(run([{ kind: 'apply-started' }], fiddled).expanded).toEqual(['moved']);
	});
});

// Review Focus 3: a re-apply must not show the previous run's count.
describe('mirrored count across runs', () => {
	it('is cleared when a new run starts and when the mirror is reverted', () => {
		expect(run([{ kind: 'apply-started' }], fixture()).mirrored).toBe(0);
		expect(run([{ kind: 'revert-started' }, { kind: 'reverted' }], fixture())).toMatchObject({
			mirrored: 0,
			expanded: ['moved'],
		});
	});
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/ui/rtl/state.test.ts`
Expected: FAIL with `summarize is not a function` (and `expanded` undefined).

- [ ] **Step 4: Implement in `src/ui/rtl/state.ts`**

1. Change the models import:

```ts
import type { BlockReason, BlockedNode, FlaggedNode } from '../../common/models';
```

2. Above `export interface RtlState`, add:

```ts
/** Every reason the snapshot gate can block `rtl-mirror` for (`src/main/snapshot/plan.ts`).
 *  `mixed-font-char-mutation` is char-writing only and never reaches this panel. */
export type SkippedReason = Exclude<BlockReason, 'mixed-font-char-mutation'>;

/** Ordered by how actionable the skip is: instances and fonts are fixable in the file (LS-28 §2.1). */
export const SKIPPED_ORDER: readonly SkippedReason[] = ['instance-locked', 'missing-font', 'already-mutated', 'empty'];

export type GroupKey = 'moved' | `skipped:${SkippedReason}`;

/** The group that needs a human starts open; report-only groups start closed (LS-28 §2.3). */
const DEFAULT_EXPANDED: readonly GroupKey[] = ['moved'];

/** One row of the change summary before copy is applied (LS-28 §1.4). */
export type SummaryGroup =
	| { kind: 'mirrored'; count: number }
	| { kind: 'moved'; key: 'moved'; nodes: FlaggedNode[] }
	| { kind: 'skipped'; key: GroupKey; reason: SkippedReason; nodes: BlockedNode[] };
```

3. In `RtlState`, after `blocked: BlockedNode[];`, add:

```ts
	/** Layers the last apply wrote to — `progress.completed`. 0 when not applied. */
	mirrored: number;
	/** Open summary groups. Reset to the default on every apply and revert. */
	expanded: GroupKey[];
```

4. In `RtlAction`, replace `| { kind: 'applied'; blocked: BlockedNode[] }` with `| { kind: 'applied'; blocked: BlockedNode[]; mirrored: number }`, and add `| { kind: 'toggle-group'; key: GroupKey }` after the `select` member.

5. Replace `initialRtlState`'s body:

```ts
	return {
		phase: 'idle',
		scope: 'page',
		flagged: [],
		blocked: [],
		mirrored: 0,
		expanded: [...DEFAULT_EXPANDED],
		selectedNodeId: null,
		errorCode: null,
	};
```

6. In `rtlReducer`, change these cases:

```ts
		case 'apply-started':
			return {
				...state,
				phase: 'applying',
				flagged: [],
				blocked: [],
				mirrored: 0,
				expanded: [...DEFAULT_EXPANDED],
				errorCode: null,
			};
```

```ts
		case 'applied':
			return { ...state, phase: 'applied', blocked: [...action.blocked], mirrored: action.mirrored };
```

```ts
		case 'reverted':
			return {
				...state,
				phase: 'idle',
				flagged: [],
				blocked: [],
				mirrored: 0,
				expanded: [...DEFAULT_EXPANDED],
				selectedNodeId: null,
			};
```

and add after `case 'select'`:

```ts
		case 'toggle-group':
			return {
				...state,
				expanded: state.expanded.includes(action.key)
					? state.expanded.filter((key) => key !== action.key)
					: [...state.expanded, action.key],
			};
```

7. Add `summarize` after `isMirrorOn`:

```ts
/**
 * The change summary (LS-28 §2.1): what the mirror did, what needs a check, what it skipped.
 *
 * Empty unless applied — before that the panel shows a StateView shell. The mirrored group is
 * always first and always present after an apply, even at 0: "0 layers mirrored" is true and is
 * the most useful thing to say about a run where everything was skipped.
 */
export function summarize(state: RtlState): SummaryGroup[] {
	if (state.phase !== 'applied') return [];
	const groups: SummaryGroup[] = [{ kind: 'mirrored', count: state.mirrored }];
	if (state.flagged.length > 0) groups.push({ kind: 'moved', key: 'moved', nodes: state.flagged });
	for (const reason of SKIPPED_ORDER) {
		const nodes = state.blocked.filter((entry) => entry.reason === reason);
		if (nodes.length > 0) groups.push({ kind: 'skipped', key: `skipped:${reason}`, reason, nodes });
	}
	return groups;
}
```

8. Replace `progressAction`:

```ts
/** The action a terminal `progress` should produce, or `null` to ignore an unexpected one.
 *  `completed` is the progress's own count — on an apply, the layers mirrored (LS-28 §1.4). */
export function progressAction(
	pending: PendingOp,
	blocked: readonly BlockedNode[],
	completed: number,
): RtlAction | null {
	if (pending === 'apply') return { kind: 'applied', blocked: [...blocked], mirrored: completed };
	if (pending === 'revert') return { kind: 'reverted' };
	return null;
}
```

- [ ] **Step 5: Keep the panel compiling**

In `src/ui/rtl/RtlPanel.tsx`, replace:

```ts
			const action = progressAction(pending.current, blocked.current);
```

with:

```ts
			const action = progressAction(pending.current, blocked.current, msg.completed);
```

- [ ] **Step 6: Run the tests, the typecheck and lint**

Run: `npx vitest run src/ui/rtl/state.test.ts && npx tsc -b && npx eslint .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/rtl/state.ts src/ui/rtl/state.test.ts src/ui/rtl/RtlPanel.tsx
git commit -m "LS-28: RTL reducer tracks the mirrored count and builds the change summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Group copy

**Files:**
- Modify: `src/ui/rtl/copy.ts` (additions only; deletions happen in Task 6)
- Test: `src/ui/rtl/copy.test.ts`

**Interfaces:**
- Consumes: `SummaryGroup`, `SkippedReason` (Task 3).
- Produces:
  ```ts
  export const UNNAMED_LAYER = 'Unnamed layer';
  export const SKIPPED_REASON: Record<SkippedReason, string>;
  export function groupCopy(group: SummaryGroup): { primary: string; meta: string };
  ```

- [ ] **Step 1: Write the failing tests**

Add to the imports of `src/ui/rtl/copy.test.ts`:

```ts
import type { BlockedNode, FlaggedNode } from '../../common/models';
import { SKIPPED_ORDER, type SummaryGroup } from './state';
```

and extend the existing `./copy` import with `SKIPPED_REASON, UNNAMED_LAYER, groupCopy`. Then append:

```ts
describe('groupCopy — the change summary’s rows (LS-28 §2.2)', () => {
	const flagged = (n: number): FlaggedNode[] =>
		Array.from({ length: n }, (_, i) => ({ nodeId: String(i), name: 'icon', reason: 'moved-vector' }));
	const skipped = (reason: BlockedNode['reason'], n: number): BlockedNode[] =>
		Array.from({ length: n }, (_, i) => ({ nodeId: String(i), reason }));

	it.each([
		[{ kind: 'mirrored', count: 12 }, '12 layers mirrored', 'layout flipped right-to-left'],
		[{ kind: 'mirrored', count: 1 }, '1 layer mirrored', 'layout flipped right-to-left'],
		// Review Focus 5: plural at zero.
		[{ kind: 'mirrored', count: 0 }, '0 layers mirrored', 'layout flipped right-to-left'],
		[{ kind: 'moved', key: 'moved', nodes: flagged(3) }, '3 icons moved', 'check direction'],
		[{ kind: 'moved', key: 'moved', nodes: flagged(1) }, '1 icon moved', 'check direction'],
		[
			{ kind: 'skipped', key: 'skipped:instance-locked', reason: 'instance-locked', nodes: skipped('instance-locked', 2) },
			'2 layers skipped',
			'inside a component instance',
		],
		[
			{ kind: 'skipped', key: 'skipped:missing-font', reason: 'missing-font', nodes: skipped('missing-font', 1) },
			'1 layer skipped',
			'font unavailable',
		],
		[
			{ kind: 'skipped', key: 'skipped:already-mutated', reason: 'already-mutated', nodes: skipped('already-mutated', 2) },
			'2 layers skipped',
			'Preview or Pseudo-loc is active',
		],
		[
			{ kind: 'skipped', key: 'skipped:empty', reason: 'empty', nodes: skipped('empty', 1) },
			'1 layer skipped',
			'empty layer',
		],
	] as [SummaryGroup, string, string][])('%o → %s', (group, primary, meta) => {
		expect(groupCopy(group)).toEqual({ primary, meta });
	});

	// Says "layers", never "frames": `succeeded` counts every layer written, not only containers.
	it('never calls the mirrored count frames', () => {
		expect(groupCopy({ kind: 'mirrored', count: 12 }).primary).not.toMatch(/frame/i);
	});

	it('has a reason line for every skip reason the panel can show', () => {
		for (const reason of SKIPPED_ORDER) expect(SKIPPED_REASON[reason]).toMatch(/\S/);
	});

	it('names the fallback for a layer with no name', () => {
		expect(UNNAMED_LAYER).toBe('Unnamed layer');
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/rtl/copy.test.ts`
Expected: FAIL with `groupCopy is not a function`.

- [ ] **Step 3: Implement**

At the top of `src/ui/rtl/copy.ts`, add the import:

```ts
import type { SkippedReason, SummaryGroup } from './state';
```

Append:

```ts
/** A child row's name when the node reported none, or an empty one (LS-28 §2.2). */
export const UNNAMED_LAYER = 'Unnamed layer';

/**
 * Why a layer was skipped, in the user's terms (LS-28 §2.2). A `Record` over every reason, so
 * adding a `BlockReason` the mirror can hit fails `tsc` until it has copy.
 */
export const SKIPPED_REASON: Record<SkippedReason, string> = {
	'instance-locked': 'inside a component instance',
	'missing-font': 'font unavailable',
	'already-mutated': 'Preview or Pseudo-loc is active',
	empty: 'empty layer',
};

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * A summary group's two lines.
 *
 * "Layers", not the issue sketch's "frames": `succeeded` counts every layer the mirror wrote —
 * containers, their direct children and text (F6) — so "frames" would overstate it. "Icons" is the
 * user's word for `FLAGGABLE_TYPES`, the leaf vector types.
 */
export function groupCopy(group: SummaryGroup): { primary: string; meta: string } {
	switch (group.kind) {
		case 'mirrored':
			return { primary: count(group.count, 'layer mirrored', 'layers mirrored'), meta: 'layout flipped right-to-left' };
		case 'moved':
			return { primary: count(group.nodes.length, 'icon moved', 'icons moved'), meta: 'check direction' };
		case 'skipped':
			return {
				primary: count(group.nodes.length, 'layer skipped', 'layers skipped'),
				meta: SKIPPED_REASON[group.reason],
			};
	}
}
```

- [ ] **Step 4: Run the tests, the typecheck and lint**

Run: `npx vitest run src/ui/rtl/copy.test.ts && npx tsc -b && npx eslint .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/rtl/copy.ts src/ui/rtl/copy.test.ts
git commit -m "LS-28: copy for the RTL change summary groups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `summaryRows` — groups plus expansion become a flat list of rows

**Files:**
- Create: `src/ui/rtl/rows.ts`
- Test: `src/ui/rtl/rows.test.ts`

**Interfaces:**
- Consumes: `SummaryGroup`, `GroupKey` (Task 3); `groupCopy`, `UNNAMED_LAYER` (Task 4); `RowTone` (type only, from `src/ui/shell/ResultsRow.tsx`).
- Produces:
  ```ts
  export type RowTrailingModel =
  	| { kind: 'none' }
  	| { kind: 'expand'; key: GroupKey; expanded: boolean }
  	| { kind: 'jump'; nodeId: string };
  export interface SummaryRowModel {
  	id: string;          // unique across the list; React key
  	depth: 0 | 1;
  	tone: RowTone;
  	primary: string;
  	meta: string;
  	trailing: RowTrailingModel;
  }
  export function toneOf(group: SummaryGroup): RowTone;
  export function summaryRows(groups: readonly SummaryGroup[], expanded: readonly GroupKey[]): SummaryRowModel[];
  ```

Why a separate module: `RtlPanel.tsx` imports `../bridge`, which touches `window`, so it cannot render in Vitest. Keeping all the row decisions in a pure function means a test covers them, the same lesson as `selectShell`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/rtl/rows.test.ts`:

```ts
// src/ui/rtl/rows.test.ts — the change summary as the rows the panel renders (LS-28 §2.3). Pure.
import { describe, expect, it } from 'vitest';
import type { SummaryGroup } from './state';
import { summaryRows, toneOf } from './rows';

const groups: SummaryGroup[] = [
	{ kind: 'mirrored', count: 12 },
	{ kind: 'moved', key: 'moved', nodes: [{ nodeId: '1', name: 'chevron', reason: 'moved-vector' }] },
	{
		kind: 'skipped',
		key: 'skipped:instance-locked',
		reason: 'instance-locked',
		nodes: [
			{ nodeId: '7', reason: 'instance-locked', name: 'Label' },
			{ nodeId: '8', reason: 'instance-locked' },
			{ nodeId: '9', reason: 'instance-locked', name: '   ' },
		],
	},
];

describe('toneOf — the strip carries meaning (LS-28 §2.3)', () => {
	it('neutral for done, amber for check, grey for not done', () => {
		expect(groups.map(toneOf)).toEqual(['neutral', 'truncates', 'unmeasurable']);
	});
});

describe('summaryRows', () => {
	it('renders the mirrored row with no trailing affordance', () => {
		expect(summaryRows(groups, [])[0]).toEqual({
			id: 'mirrored',
			depth: 0,
			tone: 'neutral',
			primary: '12 layers mirrored',
			meta: 'layout flipped right-to-left',
			trailing: { kind: 'none' },
		});
	});

	it('collapsed groups render only their header', () => {
		const rows = summaryRows(groups, []);
		expect(rows.map((r) => r.id)).toEqual(['mirrored', 'moved', 'skipped:instance-locked']);
		expect(rows[1]?.trailing).toEqual({ kind: 'expand', key: 'moved', expanded: false });
	});

	it('an open group renders its children, indented and jumpable, directly under it', () => {
		const rows = summaryRows(groups, ['moved']);
		expect(rows.map((r) => r.id)).toEqual(['mirrored', 'moved', 'moved:1', 'skipped:instance-locked']);
		expect(rows[1]?.trailing).toEqual({ kind: 'expand', key: 'moved', expanded: true });
		expect(rows[2]).toEqual({
			id: 'moved:1',
			depth: 1,
			tone: 'truncates',
			primary: 'chevron',
			meta: 'check direction',
			trailing: { kind: 'jump', nodeId: '1' },
		});
	});

	// Review Focus 1: absent, empty or whitespace names never render as a blank line.
	it('falls back to Unnamed layer for a missing or blank name', () => {
		const rows = summaryRows(groups, ['skipped:instance-locked']);
		expect(rows.filter((r) => r.depth === 1).map((r) => r.primary)).toEqual(['Label', 'Unnamed layer', 'Unnamed layer']);
	});

	// Review Focus 4: the same nodeId in two groups must not collide as a React key.
	it('keeps row ids unique when a node id repeats across groups', () => {
		const dup: SummaryGroup[] = [
			{ kind: 'mirrored', count: 1 },
			{ kind: 'moved', key: 'moved', nodes: [{ nodeId: '5', name: 'a', reason: 'moved-vector' }] },
			{ kind: 'skipped', key: 'skipped:empty', reason: 'empty', nodes: [{ nodeId: '5', reason: 'empty' }] },
		];
		const ids = summaryRows(dup, ['moved', 'skipped:empty']).map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('is empty when there are no groups', () => {
		expect(summaryRows([], ['moved'])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/rtl/rows.test.ts`
Expected: FAIL with `Failed to resolve import "./rows"`.

- [ ] **Step 3: Implement**

Create `src/ui/rtl/rows.ts`:

```ts
// src/ui/rtl/rows.ts
//
// The change summary as the flat list of rows the RTL panel renders (LS-28 §2.3).
//
// Pure, and apart from the panel, for the reason `selectShell` is: RtlPanel imports `../bridge`
// and cannot render under Vitest, so any decision left in its markup is one no test is watching.
import type { RowTone } from '../shell/ResultsRow';
import { UNNAMED_LAYER, groupCopy } from './copy';
import type { GroupKey, SummaryGroup } from './state';

export type RowTrailingModel =
	| { kind: 'none' }
	| { kind: 'expand'; key: GroupKey; expanded: boolean }
	| { kind: 'jump'; nodeId: string };

export interface SummaryRowModel {
	/** Unique across the list, so it doubles as the React key. Children are prefixed by their
	 *  group, because one node id can appear in two groups. */
	id: string;
	depth: 0 | 1;
	tone: RowTone;
	primary: string;
	meta: string;
	trailing: RowTrailingModel;
}

/** The strip carries meaning, not inherited chrome: neutral = done, amber = check, grey = not done. */
export function toneOf(group: SummaryGroup): RowTone {
	switch (group.kind) {
		case 'mirrored':
			return 'neutral';
		case 'moved':
			return 'truncates';
		case 'skipped':
			return 'unmeasurable';
	}
}

const displayName = (name: string | undefined): string =>
	name !== undefined && name.trim() !== '' ? name : UNNAMED_LAYER;

export function summaryRows(groups: readonly SummaryGroup[], expanded: readonly GroupKey[]): SummaryRowModel[] {
	const rows: SummaryRowModel[] = [];
	for (const group of groups) {
		const tone = toneOf(group);
		const { primary, meta } = groupCopy(group);
		if (group.kind === 'mirrored') {
			rows.push({ id: 'mirrored', depth: 0, tone, primary, meta, trailing: { kind: 'none' } });
			continue;
		}
		const open = expanded.includes(group.key);
		rows.push({ id: group.key, depth: 0, tone, primary, meta, trailing: { kind: 'expand', key: group.key, expanded: open } });
		if (!open) continue;
		for (const node of group.nodes) {
			rows.push({
				id: `${group.key}:${node.nodeId}`,
				depth: 1,
				tone,
				primary: displayName(node.name),
				meta,
				trailing: { kind: 'jump', nodeId: node.nodeId },
			});
		}
	}
	return rows;
}
```

- [ ] **Step 4: Run the tests, the typecheck and lint**

Run: `npx vitest run src/ui/rtl/rows.test.ts && npx tsc -b && npx eslint .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/rtl/rows.ts src/ui/rtl/rows.test.ts
git commit -m "LS-28: summaryRows turns the change summary into panel rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Wire the panel, retire the old shells, and update the docs

**Files:**
- Modify: `src/ui/rtl/RtlPanel.tsx`
- Modify: `src/ui/rtl/state.ts` (`selectShell`, `RtlShell`; delete `missingFontCount`)
- Modify: `src/ui/rtl/copy.ts` (delete `STATES.nothingToReview`, `fontsUnavailable`, `FLAG_REASON`)
- Modify: `src/ui/rtl/state.test.ts`, `src/ui/rtl/copy.test.ts`
- Modify: `docs/specs/LS-11.md` (§2.9 and §2.10 notes)

**Interfaces:**
- Consumes: `summarize`, `GroupKey` (Task 3); `summaryRows` (Task 5); `ResultsRow` with `RowTrailing` and `depth` (Task 2).
- Produces: `export type RtlShell = 'operation-failed' | 'no-text-on-page' | 'first-run' | null;` and `export function selectShell(state: RtlState): RtlShell;`

- [ ] **Step 1: Rewrite the `selectShell` tests (failing first)**

In `src/ui/rtl/state.test.ts`:
- Remove `missingFontCount` from the import.
- Delete the whole `describe('missingFontCount', …)` block.
- Replace the whole `describe('selectShell — what the panel body shows', …)` block with:

```ts
describe('selectShell — what the panel body shows (LS-28 §2.4)', () => {
	const applied = (flagged = 0, blocked: BlockedNode[] = []): RtlState =>
		run([
			{ kind: 'apply-started' },
			...(flagged > 0
				? [{ kind: 'flagged' as const, flagged: Array.from({ length: flagged }, (_, i) => flag(String(i))) }]
				: []),
			{ kind: 'applied', blocked, mirrored: 1 },
		]);

	/**
	 * The regression the old `no-issues` shell existed for — "Nothing to mirror yet" under a banner
	 * reading "RTL mirror applied" — cannot happen now: an applied mirror always shows the summary.
	 */
	it('shows the summary for every applied mirror, clean, flagged or blocked', () => {
		expect(selectShell(applied())).toBeNull();
		expect(selectShell(applied(2))).toBeNull();
		expect(selectShell(applied(0, [blocked('missing-font')]))).toBeNull();
	});

	it('shows first-run only before anything is applied', () => {
		expect(selectShell(initialRtlState())).toBe('first-run');
		expect(selectShell(run([{ kind: 'revert-started' }, { kind: 'reverted' }], applied()))).toBe('first-run');
	});

	// A failure outranks everything: the canvas was restored, so there is nothing to summarise.
	it('shows the failure state even with a stale review list', () => {
		expect(selectShell(run([{ kind: 'failed', code: 'mutation-failed' }], applied(2)))).toBe('operation-failed');
	});
});
```

- In `describe('selectShell distinguishes "nothing to mirror" from "the mirror failed"', …)`, remove the second argument `, 0` from all three `selectShell(…)` calls.

In `src/ui/rtl/copy.test.ts`:
- Remove `FLAG_REASON` and `fontsUnavailable` from the `./copy` import.
- Delete the `describe('fontsUnavailable — counts layers, not fonts', …)` and `describe('FLAG_REASON — …', …)` blocks.
- In the `STATES` test, change the expected keys to `['firstRun', 'noText', 'operationFailed']`.

Run: `npx vitest run src/ui/rtl`
Expected: FAIL. `selectShell(applied())` returns `'no-issues'`, and the `STATES` keys still include `nothingToReview`.

- [ ] **Step 2: Implement `selectShell` and delete `missingFontCount` in `src/ui/rtl/state.ts`**

Delete the `missingFontCount` function and its doc comment. Replace the `RtlShell` type and `selectShell`, keeping the existing doc comment above `RtlShell` but rewriting its last paragraph, with:

```ts
/** Which empty state the panel body should show, or `null` to render the change summary.
 *
 * Extracted from the panel because it is decision logic, not markup — it shipped wrong once
 * (a successful mirror with nothing to review fell through to the first-run copy). Since LS-28 the
 * phase alone decides: an applied mirror always has a summary to show, so the `no-issues` and
 * `fonts-unavailable` shells are gone.
 */
export type RtlShell = 'operation-failed' | 'no-text-on-page' | 'first-run' | null;

export function selectShell(state: RtlState): RtlShell {
	// "Nothing in scope to mirror" is not a failure, and saying "The mirror failed and your canvas
	// was restored" for it is alarming and untrue — nothing was attempted, so nothing was restored.
	if (state.phase === 'failed' && state.errorCode === 'no-text-nodes') return 'no-text-on-page';
	if (state.phase === 'failed') return 'operation-failed';
	if (state.phase === 'applied') return null;
	return 'first-run';
}
```

- [ ] **Step 3: Delete the retired copy in `src/ui/rtl/copy.ts`**

Delete:
- the `nothingToReview` entry of `STATES`, with its doc comment;
- `fontsUnavailable` and its doc comment;
- `FLAG_REASON` and its doc comment.

Update the file header's second paragraph to read: `Mostly transcribed from DES-2's state block rather than drafted (LS-11 §2.10). The change-summary copy at the bottom is LS-28's (§2.2).`

- [ ] **Step 4: Wire the panel in `src/ui/rtl/RtlPanel.tsx`**

1. Replace the copy and state imports with:

```ts
import { LABELS, SCOPES, STATES, appliedMessage } from './copy';
import { summaryRows } from './rows';
import {
	initialRtlState,
	isBusy,
	isMirrorOn,
	progressAction,
	rtlReducer,
	selectShell,
	summarize,
	type PendingOp,
} from './state';
```

2. Replace the component's doc comment's last paragraph (`The rows are the **review list** …`) with:

```ts
 * The rows are a **change summary** (LS-28): how many layers were mirrored, which icons moved and
 * need a direction check, and what was skipped and why. Groups expand to jumpable rows.
```

3. Replace the block from `const missingFonts = missingFontCount(state.blocked);` through the end of the `const shell = …;` expression with:

```ts
	const which = selectShell(state);
	const shell =
		which === null
			? null
			: which === 'operation-failed'
				? { state: which, ...STATES.operationFailed }
				: which === 'no-text-on-page'
					? { state: which, ...STATES.noText }
					: { state: which, ...STATES.firstRun };
	const rows = summaryRows(summarize(state), state.expanded);
```

4. Replace the whole `<ResultsList hasFooter={false}> … </ResultsList>` element with:

```tsx
				<ResultsList hasFooter={false}>
					{rows.map((row) => {
						const trailing = row.trailing;
						const shared = { tone: row.tone, primary: row.primary, meta: { label: row.meta }, depth: row.depth };
						switch (trailing.kind) {
							case 'jump':
								return (
									<ResultsRow
										key={row.id}
										{...shared}
										selected={state.selectedNodeId === trailing.nodeId}
										onSelect={() => {
											dispatch({ kind: 'select', nodeId: trailing.nodeId });
										}}
										onJump={() => {
											onJump(trailing.nodeId);
										}}
										jumpLabel={LABELS.jump}
									/>
								);
							case 'expand':
								return (
									<ResultsRow
										key={row.id}
										{...shared}
										selected={false}
										expanded={trailing.expanded}
										onSelect={() => {
											dispatch({ kind: 'toggle-group', key: trailing.key });
										}}
									/>
								);
							case 'none':
								return <ResultsRow key={row.id} {...shared} selected={false} onSelect={() => {}} />;
						}
					})}
				</ResultsList>
```

- [ ] **Step 5: Mark LS-11's superseded sections**

In `docs/specs/LS-11.md`, directly under the heading `### §2.9 What the results list shows`, insert:

```markdown
> **Superseded by LS-28** — rows are a change summary. See `docs/specs/LS-28.md`.
```

In the same file's `### §2.10 Scope, and the states` section, find the paragraph that documents the `nothingToReview` amendment, and add this line directly above it:

```markdown
> **Superseded by LS-28** — rows are a change summary; `nothingToReview` is removed.
```

(Search with `grep -n "nothingToReview\|nothing to review\|Nothing needs a direction" docs/specs/LS-11.md`. If §2.10 has no such paragraph, put the note directly under the §2.10 heading instead.)

- [ ] **Step 6: Full verification**

Run: `npx tsc -b && npx eslint . && npm test && npm run build && npm run check:docs`
Expected: every command exits 0. `grep -rn "missingFontCount\|nothingToReview\|FLAG_REASON" src/ui/rtl` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/ui/rtl docs/specs/LS-11.md
git commit -m "LS-28: RTL panel renders the change summary; retire nothingToReview and fonts-unavailable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: In-Figma acceptance (human; LS-28 §3.4–§3.5)**

This needs the Figma desktop app, so hand it to the user:
1. `npm run dev`, import `dist/manifest.json`, open `fixtures/rtl-mirror.fig`.
2. Run **Run LS-11 RTL check** and confirm `ls11:blocked-names:PASS`.
3. In the RTL tab, turn Mirror on. You should see:
   - `N layers mirrored` first;
   - `N icons moved` open, with its children jumpable;
   - the skipped groups closed, each opening to named rows.
4. Revert. The panel should return to first-run.
5. Repeat in the dark theme.
