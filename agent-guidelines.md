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
environment mistakes into compile errors instead of runtime crashes.

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
  
### Folder ownership map

Entry files live **inside** their subfolders (Plugma points the manifest at them); our modules
sit alongside. Folders marked *(new)* don't exist yet — create them when the owning issue starts.

```
src/common/messages.ts     LS-2  shared message union (imported by both sides)
src/common/models.ts       LS-2   shared wire DTOs (both sides import; owned upstream, stubbed here)
src/main/bridge.ts         LS-2   main-side send/on/respond transport
src/ui/bridge.ts           LS-2   ui-side send/on/request transport
src/main/main.ts                 Figma main-thread entry (Plugma)
src/main/traversal/        LS-3  scene-graph traversal + text-node model            (new)
src/main/snapshot/         LS-4  font-load + snapshot/restore primitive             (new)
src/ui/ui.tsx                    UI iframe entry (Plugma)
src/ui/App.tsx                   root React component
src/ui/styles.css                design-token source of truth (see §7)
src/ui/shell/              LS-5  UI shell + design system                           (new)
src/ui/export/             LS-6  export serializers (JSON / iOS / Android)          (new)
fixtures/                        test fixtures (.json generatable, .fig human-built)(new)
docs/specs/                      per-issue specs (LS-X.md)                          (new)
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

### Fonts

- **`loadFontAsync` before any `characters` or layout-affecting mutation.**
- Single-font node: `figma.loadFontAsync(node.fontName)`. **`node.fontName` may be `figma.mixed`** —
  compare with `=== figma.mixed`. For mixed-font nodes, get every font via
  `node.getRangeAllFontNames(0, node.characters.length)` and load them all before mutating.

### Text resize & truncation

- **`textAutoResize`**: `"WIDTH_AND_HEIGHT"` | `"HEIGHT"` | `"NONE"`. A fourth value `"TRUNCATE"`
  is **deprecated** and will be removed — **read and preserve it if found, never write it**
  (prefer `textTruncation`).
- **`textTruncation`**: `"DISABLED"` | `"ENDING"`.
- **`maxLines`**: `number >= 1` | `null`. Meaningful **only when `textTruncation === "ENDING"`**.
- **`maxHeight` is a second truncation trigger.** With `textAutoResize` `"NONE"`, text truncates
  when the fixed size is smaller than the content. With `"HEIGHT"` or `"WIDTH_AND_HEIGHT"`,
  truncation occurs **only in conjunction with `maxHeight` or `maxLines`**. Overflow measurement
  must account for `maxHeight`, not just `maxLines`.

### Restore mechanics

- **`resizeWithoutConstraints(w, h)` for exact restore** — plain `resize()` re-applies child
  constraints. **Gotcha:** `resizeWithoutConstraints` sets an exact bounding box and therefore
  **resets `textAutoResize`** (removes the autoresize mode). When restoring, restore
  `textAutoResize` *after* any resize, or avoid resizing a node whose original mode was not
  `"NONE"` — restoring the mode alone re-derives the box. Byte-identical restore depends on
  getting this order right.

### Document access & storage

- **`documentAccess: "dynamic-page"`** (set in the manifest): **always `figma.getNodeByIdAsync`**,
  never the synchronous `getNodeById` (which throws under dynamic-page). Traversal and any node
  lookup are async.
- **`setPluginData(key, value)`**: string values only. The **entire entry (pluginId + key + value)
  cannot exceed 100 kB** — and this limit is now actively enforced (since ~March 2025). Budget
  per-node keys accordingly.
- **`figma.clientStorage`**: async, plugin-scoped (other plugin IDs can't read it), persists across
  sessions. **5 MB total per plugin**; may be cleared by the user clearing their browser/app cache,
  so treat it as a cache, not durable truth.

### Network & measurement

- **The plugin UI iframe is origin `null` and CORS-restricted.** Phase 1 ships
  `networkAccess.allowedDomains: ["none"]` — no in-plugin fetches. **Paid-intent is a browser
  navigation, not a fetch:** open the waitlist with **`figma.openExternal(url)`** (opens a URL in a
  new tab; no allowlisted domain needed). *(There is no `figma.openURL` — do not use it.)*
- **There is no non-mutating text-measurement API.** You cannot read the rendered size of
  hypothetical text without changing the node. The measurement strategy is the **output of the LS-7
  spike** (temp-node clone vs. mutate-and-restore vs. geometry) — do not invent a measurement path;
  consume the one LS-7 resolves.

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

## 7. Brand tokens

- **Typefaces:** Bricolage Grotesque (display / headings), Hanken Grotesk (body / UI text),
  JetBrains Mono (keys, code, exported strings, measurements).
- **Palette token names:** `--canvas`, `--ink`, `--selection`, `--overflow`. These are
  **provisional** and may change during the DES-1 design pass — especially the colors.
- **`src/ui/styles.css` is the single source of truth for token *values*.** Code and specs
  reference token **names** only — never hex literals, anywhere. A token change must be a one-file
  edit to `styles.css` with nothing to chase elsewhere. (This is why no hex values appear in this
  document.)
- The brand tokens are not yet in `styles.css` (it currently holds Plugma defaults) — they're
  populated in the LS-5 shell work.

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
