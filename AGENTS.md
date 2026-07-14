# AGENTS.md

LocaleSync is a Figma plugin for localization QA and developer string handoff. Phase 1 is free
and client-only (no backend): scene-graph traversal, a snapshot/restore primitive, overflow
detection (the hero feature), pseudo-localization, RTL mirroring, in-canvas preview, and
JSON/iOS/Android export. Built with Plugma (React + Vite + TypeScript).

## Commands

- `npm run dev` — Plugma dev server + HMR (import `dist/manifest.json` in the Figma desktop app)
- `npm run build` — production build to `dist/`
- `npm test` — Vitest (`vitest run`), co-located `src/**/*.test.{ts,tsx}`
- `npx tsc -b` — typecheck (no npm alias)
- `npx eslint .` — lint

Keep `npx tsc -b`, `npx eslint .`, and `npm test` green on every change.

## Hard rules

- **Main thread has NO DOM and NO Node.** `src/main/*` uses only the `figma` global and
  `@figma/plugin-typings`. `document` / `window` / `process` there is a compile error — keep it so.
- **Never mutate a node with `hasMissingFont === true`** — it won't re-layout and silently
  corrupts state. Skip and flag.
- **All `main` ↔ `ui` traffic goes through `src/common/messages.ts`** (typed discriminated union,
  correlation ids). No raw `postMessage` in feature code.
- **Always `figma.getNodeByIdAsync`** — the manifest is `documentAccess: "dynamic-page"`; the sync
  `getNodeById` throws.
- **Never invent Figma API.** Check the pins in `docs/agent-guidelines.md` first, the live docs at
  <https://developers.figma.com/docs/plugins/> second.

## Folder ownership

```
src/common/messages.ts     LS-2  shared message union (both sides import)
src/common/models.ts       LS-2   shared wire DTOs (both sides import; owned upstream, stubbed here)
src/main/bridge.ts         LS-2   main-side send/on/respond transport
src/ui/bridge.ts           LS-2   ui-side send/on/request transport
src/main/main.ts                 Figma main-thread entry
src/main/traversal/        LS-3  scene-graph traversal + text-node model
src/main/snapshot/         LS-4  font-load + snapshot/restore primitive (human review before merge)
src/ui/ui.tsx                    UI iframe entry
src/ui/App.tsx                   root React component
src/ui/styles.css                design-token source of truth (reference names, never hex)
src/ui/shell/              LS-5  UI shell + design system
src/ui/export/             LS-6  export serializers
fixtures/                        test fixtures (.json generatable, .fig human-built)
docs/specs/                      per-issue specs (LS-X.md)
```

## More

Full conventions, the Figma API pins, the contracts rule, and the spec template live in
**`docs/agent-guidelines.md`**. Per-feature specs live in **`docs/specs/`** — read the relevant
spec before implementing its issue.
