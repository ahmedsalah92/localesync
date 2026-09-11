# LocaleSync — Agent Guidelines

The single shared source of cross-cutting conventions for LocaleSync (a Figma plugin for
localization QA and developer string handoff; Phase 1 is free, client-only, no backend).
Every per-issue spec (`docs/specs/LS-X.md`) and every Claude Code session reads this file so
specs stay thin: they reference the conventions and API pins here instead of repeating them.
`CLAUDE.md` at the repo root is the short, auto-loaded pointer to this document.

If anything here disagrees with an older doc (e.g. `SETUP-scaffold-LS1.md`), the live repo and
this file win.

---

## 1. Repo & TypeScript conventions

### Three composite TypeScript projects

The build is a solution-style root `tsconfig.json` (`files: []`, project references only) over
three composite projects. The split is a guardrail, not organization for its own sake — it turns
environment mistakes into compile errors insteaVd of runtime crashes.

| Project | Environment | `lib` | `types` | Consumed by |
|---|---|---|---|---|
| `src/common` | env-neutral | (default) | `[]` (ambient-free) | both `main` and `ui` |
| `src/main` | Figma main thread | `["ES2020"]` — **NO DOM** | `["@figma/plugin-typings"]` | — |
| `src/ui` | iframe | `["ES2022","DOM","DOM.Iterable"]` | `["vite/client"]` | — |

- **`common` must stay ambient-free** (`types: []`, no `figma`, no DOM). It is imported by both
  sides, so any ambient type it pulls in leaks into an environment where it's wrong. Put shared
  types and the message contract here; nothing environment-specific.
- **`main` has no DOM and no Node.** `lib: ["ES2020"]` with only `@figma/plugin-typings` means a
  reference to `document`, `window`, or `process` on the main thread is a **compile error**, not a
  runtime surprise. Never reach for browser or Node globals in `src/main`.
- **`ui` is the only place DOM libs exist.** React + Vite live here.
- Both `main` and `ui` reference `../common`. Build order is resolved by those references, not by
  the array order in the root file.

**Test files need their own configs, and ESLint needs to be told about them separately.** Each
project excludes `*.test.ts(x)`, so tests belong to sibling `src/<project>/tsconfig.test.json`
files that extend the production config, set `include` to that directory's tests, and **must set
`"exclude": []`** — the inherited `exclude` otherwise silently re-excludes the files `include`
just added back, producing a config that covers nothing and passes identically to one that works.
One test config per project, never a single shared one: a merged `lib`/`types` union would let a
`main` test reference `document` and a `ui` test reference `figma` and still compile, discarding
the guardrail this table exists to enforce.

typescript-eslint's `projectService` cannot find these files. It resolves a file's project through
tsserver's ancestor search, which looks for a file literally named `tsconfig.json` and never
considers a sibling `tsconfig.test.json`, regardless of what the root solution file references.
Test globs therefore need a targeted override using the classic `project` array pointing directly
at the three test configs. (LS-22, 2026-09-04.)

### Emit, strictness, formatting

- All three projects are `composite: true` + `emitDeclarationOnly: true`, emitting `.d.ts` to
  `node_modules/.tmp/tsc`. Emitted declarations are **never linted and never committed** —
  `eslint.config.js` `globalIgnores` includes `**/*.d.ts`, and `node_modules/` is git-ignored.
- `strict: true` and `noUncheckedIndexedAccess: true` everywhere. `main` and `ui` additionally
  carry `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`; `common` does not
  (minor asymmetry — hold the same discipline there by hand).
- **Typecheck is `npx tsc -b`** (no npm alias). Prettier is tabs, width 4, single quotes, semi,
  printWidth 120. Keep `npx tsc -b`, `npx eslint .`, and `npm test` green on every change.
- **A member-less type is a type alias, never an empty interface.** `@typescript-eslint/no-empty-object-type`
  is on (recommended config, default options), so an interface that only extends another and adds no
  members — e.g. a payload-free bridge message, `interface RevertPreview extends Envelope<'…'> {}` —
  **fails `npx eslint .`**. Write it as a type alias instead: `type RevertPreview = Envelope<'revert-preview'>`.

### The main bundle must be emitted at ES2017

`vite.config.ts` sets `build.target: 'es2017'` for the `main` context only. The UI is unaffected —
it runs in a real browser iframe and needs no downlevelling. The two bounds on that target have
very different standing:

- **Floor — verified.** Below ES2017 there is no native `async`/`await`, so esbuild rewrites every
  async function into a generator plus a Promise driver. Figma's plugin VM (QuickJS compiled to
  wasm) fails to compile that output. Measured: at `es6` the bundle carried 13 `function*` bodies
  and the plugin did not load; at `es2017` it carries none and the plugin loads, in both dev and
  production builds. Which half of the rewrite QuickJS actually chokes on — the generators or the
  driver around them — is not established; they always appear together.
- **Ceiling — precautionary.** No target above ES2017 has ever been observed failing in Figma. The
  ES2017 cap exists because it is the lowest target known to work, not because anything newer is
  known to break. Raising it is allowed; it costs one experiment (build at the new target, load the
  plugin in Figma, both dev and production) and contradicts no measured result. If it passes, move
  the cap in `vite.config.ts` and `check:dist` together.

A floor failure is **total and silent**: the VM rejects the whole script at bytecode compilation,
so *no line of plugin code executes*. There is no stack, because there was never any execution to
have one. All you see is `InternalError: stack underflow (op=113, pc=263)` from Figma's vendor
bundle; a `console.log` on the first line of `main.ts` does not print.

**"Set no target" does not mean "Vite's default" here — it means Plugma's `es6`.** Plugma
hard-codes `target: 'es6'` for the main context (`create-vite-configs.js`, both dev and build), and
that is exactly what shipped the floor failure above. Our `vite.config.ts` value wins only because
Plugma merges user config as `mergeConfig`'s second argument — delete it and you are back on `es6`.

`npm run check:dist` enforces both bounds on `dist/main.js`: acorn parses it at `ecmaVersion: 2017`
(the ceiling) and walks the AST for generator functions (the floor). The parse alone cannot catch
the floor — generators are ES2015 and parse clean at 2017 — so the walk is the load-bearing check.
It is a proxy: a hand-written `function*` in `src/main/` would also trip it, and the failure message
points here so whoever hits it gets the real diagnosis — usually a regressed `build.target`.

This is invisible from the source, and every other gate is blind to it: all three tsconfigs are
`emitDeclarationOnly`, so `tsc -b` emits no JS and has no opinion on output syntax; ESLint reads
source, not bundle; Vitest runs in Node, which supports everything; and `plugma build` succeeding
means only that a bundle was produced. Nothing but `check:dist` inspects the artifact that Figma
actually loads.

### Folder ownership map

Entry files live **inside** their subfolders (Plugma points the manifest at them); our modules
sit alongside. Folders marked *(new)* don't exist yet — create them when the owning issue starts.

```
src/common/messages.ts          LS-2   shared message union (imported by both sides)
src/common/models.ts            LS-2   shared wire DTOs (both sides import; owned upstream, stubbed here)
src/common/overflow.ts          LS-8   display order, filters and sorting (both sides import)
src/main/bridge.ts              LS-2   main-side send/on/respond transport
src/main/window.ts              LS-21  window size: restore, clamp, persist
src/ui/bridge.ts                LS-2   ui-side send/on/request transport
src/main/main.ts                       Figma main-thread entry (Plugma)
src/main/traversal/             LS-3   scene-graph traversal + text-node model            (new)
src/main/snapshot/              LS-4   font-load + snapshot/restore primitive             (new)
src/main/overflow/              LS-8   measurement engine (LS-8.1)
src/ui/ui.tsx                          UI iframe entry (Plugma)
src/ui/App.tsx                         root React component
src/ui/styles.css                      UI3 token alias layer — names only, no values (see §7)
src/ui/shell/                   LS-5   UI shell + design system                           (new)
src/ui/shell/ResizeHandle.tsx   LS-21  edge + corner resize grip
src/ui/export/                  LS-6   export serializers (JSON / iOS / Android)          (new)
src/ui/overflow/                LS-8   overflow results panel (LS-8.2)
src/ui/devtools/                       dev-only in-Figma acceptance harness buttons
fixtures/                              test fixtures (.json generatable, .fig human-built)(new)
docs/specs/                            per-issue specs (LS-X.md)                          (new)
```

---

## 2. Figma API pins

The canonical set of Figma Plugin API facts every issue relies on. Each was verified against the
live docs at <https://developers.figma.com/docs/plugins/>. **For any API surface not pinned here,
consult the live docs — never invent API shape from memory.**

### Lifecycle & safety

- **`figma.on('close', …)` runs synchronous code only.** `close` is an `ArgFreeEventType`; async
  continuations in the callback do **not** run (the plugin is being torn down), so
  `getNodeByIdAsync` and anything awaited is unusable there. It is also best-effort — not
  guaranteed to fire on every teardown path (e.g. closing the document/tab). **Therefore the close
  handler is not the safety guarantee.** The real guarantee is a **durable snapshot written
  *before* mutation** (`setPluginData` on the node + a `clientStorage` manifest of what's in
  flight) plus **restore-on-launch**: on next run, detect an unfinished mutation and restore. The
  close handler is a best-effort fast-path cleanup only.

- **Never mutate, resize, or relayout a node with `hasMissingFont === true`.** With a missing font
  the node will not re-layout; mutating it silently corrupts state and produces false measurements.
  Check `hasMissingFont` before loading fonts or writing any layout-affecting property; when true,
  **skip and flag**, never mutate. (Official guidance: "check `text.hasMissingFont` before loading
  a font … do not ignore this.")

### Plugin window & timers

- **`figma.ui.resize(width, height)` takes iframe dimensions and enforces only Figma's 70×0
  minimum.** Product minimums must be clamped by the plugin. Figma's own ~40px window chrome sits
  above and outside the supplied height.
  <https://developers.figma.com/docs/plugins/api/figma-ui/>
- **Main-thread timers are declared globals.** `@figma/plugin-typings@1.130.0` declares
  `setTimeout(callback, timeout): number` and `clearTimeout(handle: number): void`; the timeout is
  required and the handle is a number. `figma.closePlugin()` cancels pending timers.

### Fonts

- **`loadFontAsync` before any `characters` or layout-affecting mutation.**
- Single-font node: `figma.loadFontAsync(node.fontName)`. **`node.fontName` may be `figma.mixed`** —
  compare with `=== figma.mixed`. For mixed-font nodes, get every font via
  `node.getRangeAllFontNames(0, node.characters.length)` and load them all before mutating.

### Text resize & truncation

- **`textAutoResize` has four live values**: `"WIDTH_AND_HEIGHT"` | `"HEIGHT"` | `"NONE"` |
  `"TRUNCATE"`. **`"TRUNCATE"` is encountered in real files** — a fixed-size node with truncation
  enabled reports `textAutoResize === "TRUNCATE"` on current Figma, not `"NONE"`. This is not a
  legacy-file artifact. **Any exhaustive switch on `textAutoResize` must handle four values**, or
  fixed-size truncating nodes fall through.
  **`TRUNCATE` measurement mechanics are identical to `NONE`** (unlock the box so content determines
  size), **but the verdict differs**: `truncates` rather than `overflows`, because the user has
  truncation enabled — the content would be ellipsized, not clipped silently. An implementation may
  normalise the mode internally, but it must not normalise the *verdict*. See `docs/specs/LS-7.md`
  §1–§2 for the per-mode rules. *(§6 of that document states the normalisation more loosely —
  "treat `TRUNCATE` as `NONE` + ENDING internally" — without the verdict caveat; §1–§2 govern.)*
  *(Verified live 2026-07-23 against `fixtures/kitchen-sink.fig` row `truncating`, and 2026-07-25
  against `fixtures/overflow-spike.fig` rows `truncate-fits` / `truncate-overflows` — both pass,
  LS-7.md §6.)*
  **Writing:** set truncation via `textTruncation = 'ENDING'` on a fixed-size node and Figma derives
  the reported `TRUNCATE` mode itself — that is the write path the LS-7 fixture generator uses.
  Read truncation *semantics* from `textTruncation`, and the resize mode from `textAutoResize`.
  *(Current Figma also logs a notice on the read path — "`textAutoResize` will stop returning
  `TRUNCATE` in a future version — read from `textTruncation` instead." Observed live 2026-07-25,
  LS-7 spike run. It is a forward-compatibility notice on how to read truncation state; it does not
  make `TRUNCATE` absent today, and the four-mode handling above stands.)*
- **`textTruncation`**: `"DISABLED"` | `"ENDING"`.
- **`maxLines`**: `number >= 1` | `null`. Meaningful only when `textTruncation === "ENDING"` — and
  **settable only when resizing is auto-height or auto-width** (or hug, for text in auto-layout
  frames). On a fixed-size node Figma hides the Max lines field and **silently rejects an API
  write**, leaving `maxLines === null`. So fixed-size truncation is a box-clip trigger with no line
  cap; `maxLines` truncation requires a growing node. Overflow verdicts must treat these as two
  distinct paths. *(Figma docs: "Explore text properties" → Text truncation and max lines.
  Verified live 2026-07-23.)*
- **`maxHeight` is a second truncation trigger.** With `textAutoResize` `"NONE"`, text truncates
  when the fixed size is smaller than the content. With `"HEIGHT"` or `"WIDTH_AND_HEIGHT"`,
  truncation occurs **only in conjunction with `maxHeight` or `maxLines`**. Overflow measurement
  must account for `maxHeight`, not just `maxLines`.
- **`TextNode.maxHeight`** — `number | null`; readable on any text node, but "applicable only to
  auto-layout frames and their direct children", so it is populated only for auto-layout children.
  <https://developers.figma.com/docs/plugins/api/TextNode/>
  **The "auto-layout only" restriction governs the *write*, not the *enforcement*:** a set
  `maxHeight` keeps capping auto-height growth after the node leaves auto-layout — a `clone()` of
  an auto-layout child parented to the page still stops at exactly `maxHeight`. **Clearing it
  (`maxHeight = null`) off auto-layout is silently rejected** — like the `maxLines` reject
  above: LS-7 run 3 still measured exactly `maxHeight` after the null write plus a forced
  characters-rewrite re-layout. Cap detection must therefore be binding-agnostic: content
  height *reaching* `maxHeight` ⇒ the cap is active — never rely on observing uncapped growth.
  *(Verified live 2026-07-25 against `fixtures/overflow-spike.fig` row `autoheight-maxheight` —
  LS-7.md §6.)*

### Node geometry & hierarchy

- **`clipsContent` exists on frame-like nodes only** (`FRAME` / `COMPONENT` / `COMPONENT_SET` /
  `INSTANCE`) — it was **removed from group nodes**. Guard by `node.type`, never
  `'clipsContent' in node` (Figma's typings do not guarantee `in` checks on group nodes).
  <https://developers.figma.com/docs/plugins/api/FrameNode/>
- **`rotation`** — degrees, `-180..180`, measured about the node's **top-left corner**, independent
  of the node's position.
  <https://developers.figma.com/docs/plugins/api/properties/nodes-rotation/>

### Restore mechanics

- **`resizeWithoutConstraints(w, h)` for exact restore** — plain `resize()` re-applies child
  constraints. **Gotcha:** `resizeWithoutConstraints` sets an exact bounding box and therefore
  **resets `textAutoResize`** (removes the autoresize mode). When restoring, restore
  `textAutoResize` *after* any resize, or avoid resizing a node whose original mode was not
  `"NONE"` — restoring the mode alone re-derives the box. Byte-identical restore depends on
  getting this order right.
- **Figma floors node dimensions at 0.01 px.** `resize`/`resizeWithoutConstraints` will not produce
  an exact 0, and the stored float32 lands marginally under (`0.009999999776482582`). Zero-size
  comparisons must use a `<= 0.01` tolerance, never `=== 0`.

### Document access & storage

- **`documentAccess: "dynamic-page"`** (set in the manifest): **always `figma.getNodeByIdAsync`**,
  never the synchronous `getNodeById` (which throws under dynamic-page). Traversal and any node
  lookup are async.
- **Load the current page before traversal.** Under dynamic-page, `PageNode.findAllWithCriteria()`
  (and the other find methods) throw unless the page is loaded — `await figma.currentPage.loadAsync()`
  first. Do **not** reach for `figma.loadAllPagesAsync()` for single-page work; that is for
  cross-page traversal / `documentchange` and forces a full-document load.
  <https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/>
- **`setPluginData(key, value)`**: string values only. The **entire entry (pluginId + key + value)
  cannot exceed 100 kB** — and this limit is now actively enforced (since ~March 2025). Budget
  per-node keys accordingly.
- **`figma.clientStorage`**: async, plugin-scoped (other plugin IDs can't read it), persists across
  sessions. **5 MB total per plugin**; may be cleared by the user clearing their browser/app cache,
  so treat it as a cache, not durable truth.

### Plugin data on real nodes — measured (LS-9 probes)

Observed in a real Figma runtime against `fixtures/extract-keys.fig`, by the LS-9 in-Figma harness
(`docs/specs/LS-9.md` §3.4). The live docs are silent on all of these, so they are measurements, not
documented guarantees.

- **`setPluginData` on an instance child of a *local* component lands** (probe 1): 1 stamped,
  0 blocked.
- **`setPluginData` on a *locked* node lands** (probe 3): 1 stamped, 0 blocked.
- **A node duplicated via `clone()` carries its plugin data** (probe 4). Cmd-D is assumed to behave
  the same and is **not measured**.
- **Node ids survive file duplication** (probe 5): the same group reported id `17:44` in both the
  original and the copy. One observation, on one Figma version, by one method of duplication — it is
  evidence, not a guarantee. Code must not depend on it.
- **Programmatic selection of a locked node lands** (probe 7): `figma.currentPage.selection` accepts
  it.
- **Unresolved:** probe 2 (`setPluginData` on an instance child of a *published-library* component —
  its fixture row needs library publishing and is unbuilt) and probe 6 (whether a batch of writes
  closed by one `figma.commitUndo()` reverts as a single undo step). Neither is pinned; do not assume
  an answer.

**No `setPluginData` write has ever been rejected in a real runtime.** Probes 1 and 3 both reported
zero blocked, so the rejection path in [`docs/specs/LS-9.md` §2, default 22](specs/LS-9.md#persistence)
is unexercised. It stays because probe 2 is still open.

### Network & measurement

- **The plugin UI iframe is origin `null` and CORS-restricted.** Phase 1 ships
  `networkAccess.allowedDomains: ["none"]` — no in-plugin fetches. **Paid-intent is a browser
  navigation, not a fetch:** open the waitlist with **`figma.openExternal(url)`** (opens a URL in a
  new tab; no allowlisted domain needed). *(There is no `figma.openURL` — do not use it.)*
- **There is no non-mutating text-measurement API.** You cannot read the rendered size of
  hypothetical text without changing the node. The measurement strategy is the **output of the LS-7
  spike** (temp-node clone vs. mutate-and-restore vs. geometry) — do not invent a measurement path;
  consume the one LS-7 resolves.
- **`figma.showUI(html, opts)` injects colour variables only.** With `themeColors: true`, Figma
  inserts a `<style id="figma-style">` block of `--figma-color-*` variables and sets a
  `figma-light` / `figma-dark` class on the iframe's `<html>`. **No typography or spacing variables
  reach the iframe** — UI3's text styles and `Spacers` live in Figma design files, which is a
  different system. This is why `src/ui/styles.css` binds colour but *declares* type and spacing
  (see `docs/specs/LS-5.md` §2.5). The options object is exactly `{ visible, width, height, title,
  position, themeColors }`; `title` defaults to the plugin name and is the only control over
  Figma's own window bar, which is always drawn above an iframe UI and cannot be suppressed.
  Verified against the live plugin docs 2026-09-04.

### Message bridge transport (LS-2)

The raw `postMessage` plumbing under the typed bridge. The *conventions* (discriminated union,
correlation id, no raw `postMessage` in feature code) are in §3; these are the API facts.

- **`figma.ui.postMessage(msg)` sends main → UI.** Only structured-clone-serializable data crosses
  (see the serializable set below). This is the only send path on the main side.
- **`figma.ui.onmessage = (message, props) => …` receives UI → main.** `message` is already the
  value the UI put on its `pluginMessage` property (unwrapped for you); `props.origin` is the sender
  origin. It is a **single assignable slot** — a bridge owns it and multiplexes to typed handlers;
  feature code never assigns it directly. (`figma.ui.on('message', handler)` also registers a
  handler and permits more than one registration — pick one model and hold it.)
- **UI → main: `parent.postMessage({ pluginMessage: msg }, '*')`.** The `{ pluginMessage }` wrapper
  **and** the `'*'` second argument are both required — without the wrapper the message never
  reaches the plugin code.
- **UI ← main: a `window` `'message'` listener; the payload is `event.data.pluginMessage`.** The
  wrap/unwrap asymmetry is by design — the plugin side sends and receives bare values, the UI side
  wraps outgoing and unwraps incoming under `pluginMessage`.
- **Serializable set:** objects, arrays, numbers, strings, booleans, `null`, `undefined`, `Date`,
  `Uint8Array`. **`figma.mixed` (a symbol) and live node references are NOT serializable** — so
  every payload is a plain-data DTO (`src/common/models.ts`), never a live `TextNode` or a value
  that may be `figma.mixed`. Map to the DTO before sending.
- **Dev-harness traffic shares the channel.** Under `plugma dev`, Plugma emits its own messages on
  the same `message` channel; both sides must validate every inbound message against the shared
  shape guard and **silently drop** non-conforming ones, before any handler runs.

---

## 3. Message bridge (LS-2)

The *conventions* over the transport. The raw `postMessage` API facts are in §2 → *Message bridge
transport (LS-2)*.

- All `main` ↔ `ui` traffic goes through the shared **discriminated union** in
  `src/common/messages.ts`, keyed on `type`, with a **correlation id** on request/response pairs so
  the UI can match async results.
- Thin typed `send` / `on` wrappers on each side. **No raw `postMessage` in feature code** — a
  wrong-shaped message must be a compile error, not a runtime surprise.
- **Carve-out — overflow-scan payloads use `targetLanguages: string[]`, never a scalar
  `targetLanguage: string`.** Phase 1 scans one language per pass, but the free/paid boundary is
  moving toward all-languages-free detection (brief v3.2). The plural shape lets that land without a
  breaking contract change. Shape it plural now even though the first implementation passes a
  single-element array.
- **The union is frozen by test.** `messages.test.ts` asserts the fixture count equals the union's
  member count, so a new message type cannot be added silently. Adding one is a contract change
  requiring explicit approval, not a developer's judgement call.

---

## 4. Contracts rule — reference, never redefine

The mechanism that keeps specs consistent across chats:

- Every spec has a **Contracts block**: the exact TS types and signatures it **produces** and
  **consumes**.
- A spec **never redefines a type owned by an upstream spec** — it imports/references it. Example:
  LS-8 and LS-12 consume `TextNodeModel` from `docs/specs/LS-3.md` / `src/main/traversal`; they do
  not restate its shape.
- **Ownership follows the §1 folder map.** The folder that owns the module owns its types.
- If a needed field is missing from an upstream type, **the fix is flagging the upstream spec**, not
  forking a local copy of the type. Local forks are how two definitions drift apart.

---

## 5. Spec template

Every `docs/specs/LS-X.md` follows the same shape so specs are uniform and thin:

1. **Contracts** — exact types/signatures produced and consumed; upstream types referenced per §4,
   not redefined.
2. **Resolved Defaults** — every open choice replaced with a concrete value. No "decide later"
   survives into a spec; if a decision is genuinely open, it blocks the spec, it doesn't live in it.
3. **Concrete Acceptance** — a named fixture, the enumerated expected outputs, and the exact command
   to run. Acceptance a reviewer can execute, not prose.
4. **API pins** — link to §2 of this document; do not repeat pins in the spec.

**LS-4 scope note (carry into its spec).** Scope the snapshot/restore primitive for **high call
volume from the start.** If the LS-7 spike selects mutate-and-restore measurement, restore runs at
measurement-scan scale (every candidate string on every scanned node), so it becomes
performance-critical — design for batching and bulk apply/restore up front, not as a retrofit
(brief v3.2). The spec must also resolve: the exact snapshot shape (enough to restore
byte-for-byte, including `textAutoResize` and the resize-order gotcha in §2), the
missing-font policy (skip + flag), the instance-mutation policy, and the undo-stack interaction.

---

## 6. Test & fixture conventions

- **Vitest, co-located** as `*.test.ts` / `*.test.tsx` beside the module (`vitest.config.ts`
  discovers `src/**/*.test.{ts,tsx}`). No top-level test directory.
- **Pure logic is unit-tested without the `figma` global** — serializers/escaping (LS-6),
  pseudo-loc transforms, key generation (LS-9), message-shape guards. This is everything Vitest
  should touch in Phase 1.
- **Canvas-mutating / restore-fidelity code is not Vitest's job.** Vitest can't fake a faithful
  enough `figma` runtime to prove a byte-identical restore. Verify that with a **dev-only in-Figma
  integration command** (e.g. `__test:roundtrip`) that runs against the real runtime.
- **Golden-file byte comparison for serializers**, and **golden files derive from the owning spec's
  resolved rules — never hand-typed independently.** A wrong golden and a wrong implementation can
  agree and both pass.
- Fixtures live in `fixtures/`: `.json` fixtures are generatable; `.fig` fixtures are human-built in
  Figma (the "kitchen-sink" and "known-overflow" files).
- *(Note: `npm run vitest` is Plugma's experimental in-Figma Vitest integration and needs the dev
  server running; `npm test` = `vitest run` is the standard co-located pass agents use.)*

---

## 7. Design tokens — two systems, one boundary

**The plugin surface is UI3.** UI3 is Figma's official design language. Colors, controls,
typography, icons, badges, density — if it is drivable from UI3, it comes from UI3. This is an
architectural decision, not a style preference.

**The Clipped Bar brand is separate.** Space Grotesk (display), Inter (UI/body), and the
Marigold / Charcoal / Cream / Slate palette apply to the logo, marketing site, and brand assets.
They do **not** apply to plugin chrome. The one exception on the plugin surface is the plugin's own
mark and name in the header: identity, not chrome.

**Token values come from UI3 and are bound, never copied.** Bind `--figma-color-*` CSS variables.
**No hex literals anywhere in the plugin surface.** Dark mode is in for Phase 1 *only because the
variables are bound* — a pasted hex breaks it silently and still looks correct to anyone developing
in light theme.

**One recorded exception to the no-hex rule**, and it stays a closed set of one: the mirrored
`Tooltip` on the jump affordance carries literal fill, radius, type and shadow values because the
UI3 `Tooltip` set is **unpublished** and cannot be instanced — neither `importComponentSetByKeyAsync`
nor `importComponentByKeyAsync` resolves it. It is mirrored exactly, not approximated, and it is the
only thing on the surface that will not track a UI3 update; swap it for the real instance if Figma
publishes the set. *(Rationale and the mirrored values: `design.md` → Jump affordance.)* A new hex
literal is a defect, not a precedent — anything else needing one is a question for the design pass,
not a judgement call at the keyboard.

**`src/ui/styles.css` is a thin alias layer.** It maps UI3 variable names to local names and holds
**no values of its own**. Feature code references local names; the alias file is the single place to
edit if UI3 renames a token. This preserves the reference-names-never-values discipline under the
new model.

**The alias layer covers type and spacing, not only colour.** UI3's text styles are importable and
the surface references them rather than raw font sizes: `body/body.medium`, `body/body.medium.strong`,
`body/body.large`, `heading/heading.small`, `body/body.small`. This is not cosmetic bookkeeping —
the styles carry letter-spacing (+0.5% at 11px, −0.25% at 13px) that a raw numeric size silently
drops, so a hand-set `font-size` is visibly wrong even when the number matches. Spacing likewise
resolves to UI3 `Spacers` (0 / 4 / 8 / 16 / 24 / 32 / 40); no 12px, 10px or 6px value belongs on the
plugin surface.

**UI3's type ramp is 9 / 11 / 13 / 15 — there is no 12px step.** Any spec calling for 12px text on
the plugin surface is off-ramp and must be resolved to a real step before it is built. Where two
lines of a row need hierarchy, both sit at 11px and the distinction is carried by weight and colour,
the way Figma's own layer list does it — not by inventing an intermediate size.

**One exception to the text-style rule: the mono i18n key.** UI3 ships a `font/family/mono` variable
but **no mono text style**, so size and line-height for the mono key are set directly. This is a gap
in the kit, not a licence — every other text element on the surface must reference a UI3 text style.

**Semantic vocabulary in use** (roles and rationale in `design.md`): backgrounds `bg/default`,
`bg/selected`, `bg/secondary`, `bg/info/default`, `bg/brand`; text `text/default`, `text/secondary`,
`text/tertiary`, `text/brand`, `text/warning`, `text/danger`, `text/onbrand`; icons
`icon/secondary`, `icon/success`, `icon/warning`, `icon/danger`, `icon/tertiary`; borders
`border/default`, `border/menu`, `border/selected-strong`.

**Severity ramp:** `icon/success` fits · `icon/warning` truncates · `icon/danger` overflows · (`truncates`, not `clips` — `OverflowVerdictValue` has no `'clips'` member; the canvas variant was renamed to match on 2026-09-03. User-facing copy may still say "clips"; that is LS-14's call.)
`icon/tertiary` un-measurable. Green→amber→red is ordinal, carrying rank by hue; grey sits outside
the ramp because un-measurable is an absence of measurement, not a severity.

**No custom icons, and no typographic glyphs standing in for icons** (`▾`, `›`, `✕`) — a glyph is a
custom icon wearing a font. Use UI3 icon components. If UI3 has no icon for the job, use no icon.

**Horizontal band rhythm is 40px.** Plugin header, tab bar, control bar and summary bar are all
fixed 40px. Summary bars previously hugged their content and drifted 29–40px across shells; uniform
40px is the rule now, and a band that hugs is a defect.

---

## 8. Workflow rules

- **Issue = WHAT / WHY (Linear); spec = HOW (`docs/specs/LS-X.md`).** The Linear issue holds the
  business requirement; the spec derives the implementation from the already-settled issue. Specs
  are written **just-in-time, per feature, after this guidelines doc exists** — not batched up front.
- **LS-4 requires mandatory human review before merge**, regardless of spec quality — the
  snapshot/restore primitive's blast radius is corruption of real user files. Plausible-but-wrong
  restore logic is exactly the failure an automated review misses.
- **LS-7 is a spike.** Its output is a decision doc (the measurement-strategy verdict) that
  *becomes* the LS-8 spec — not production code. Don't let LS-8 start before LS-7 closes.
- Keep `npx tsc -b`, `npx eslint .`, and `npm test` green on every change.
