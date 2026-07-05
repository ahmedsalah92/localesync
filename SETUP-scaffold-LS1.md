# LocaleSync — Repo Scaffold Runbook (LS-1)

_Exact steps to stand up the plugin repo with Plugma (React + Vite + TS), configured to the locked Phase-1 decisions. Run top to bottom; this file is meant to live at the repo root as `SETUP.md`. Steps that depend on what the scaffold actually generates are flagged "⚠ confirm" — check the real output rather than assuming._

---

## 0. Prerequisites

```bash
node -v      # must be an LTS version (Plugma requires Node LTS)
git --version
```

- Install the **Figma desktop app** (the browser app can't import a local plugin manifest): https://www.figma.com/downloads/
- Create an **empty GitHub repo** named `localesync` (no README/license — we'll push into it). This part is yours; the rest is local.

---

## 1. Scaffold with Plugma

```bash
npm create plugma@latest
```

At the prompts:

- **Framework:** `React`
- **Name:** `localesync` (or your preferred dir/plugin name)
- TypeScript: yes (if asked)

Then:

```bash
cd localesync
npm install
```

Plugma is added as a dev dependency by the template. If a later `plugma` command isn't found, add it explicitly:

```bash
npm install plugma --save-dev
```

**⚠ confirm:** note the exact entry filenames the template generated (typically a main-thread entry like `src/main.ts` and a UI entry like `src/ui.tsx`) and where the manifest lives (Plugma keeps a `manifest.json` at the project root, referenced from `package.json`). You'll need both in steps 3 and 5.

---

## 2. Install the deps the specs assume

These are referenced by the LS-4/LS-6 specs and the guidelines, so install now to keep the repo consistent:

```bash
npm install --save-dev vitest @figma/plugin-typings
npm install fast-xml-parser papaparse
```

- `vitest` — the `npm run test` harness every spec's acceptance uses.
- `@figma/plugin-typings` — main-thread `figma` global types (Plugma's TS template may already include this; skip if present).
- `fast-xml-parser` — validates Android XML export in LS-6 tests.
- `papaparse` — CSV import for LS-12 (and CSV export later).

Add the test script to `package.json` if the template didn't:

```jsonc
"scripts": {
  "dev": "plugma dev",
  "build": "plugma build",
  "test": "vitest run"
}
```

---

## 3. Configure the manifest to the locked decisions

Open the manifest (root `manifest.json`, or the manifest block in `package.json` — whichever the template uses) and set exactly these fields:

```jsonc
{
	"name": "LocaleSync",
	// "id" is left blank — Figma assigns it on first publish; paste it back here later
	"editorType": ["figma"],
	"documentAccess": "dynamic-page",
	"networkAccess": {
		"allowedDomains": ["none"],
	},
	// "main" and "ui" keys are managed by the Plugma template — do NOT hand-edit them
}
```

Why these (decisions already locked):

- `editorType: ["figma"]` — Figma Design only.
- `documentAccess: "dynamic-page"` — required for the async scene-graph access the plugin uses (`getNodeByIdAsync`, etc.).
- `networkAccess.allowedDomains: ["none"]` — Phase-1 ships network-free (decision #2); paid-intent routes via `openExternal`, telemetry sits behind a no-op sink.

**⚠ confirm (HMR):** during `plugma dev`, Plugma injects its dev-server domains automatically, so keep the production value at `["none"]`. _If_ the dev UI fails to load with a network/CSP error, add a dev-only allowance and re-run:

```jsonc
"networkAccess": {
  "allowedDomains": ["none"],
  "devAllowedDomains": ["http://localhost:*", "ws://localhost:*"]
}
```

`devAllowedDomains` is stripped from production builds, so this never reaches users.

---

## 4. Lock TypeScript strict mode

In `tsconfig.json` confirm (add if missing):

```jsonc
"compilerOptions": {
  "strict": true,
  "noUncheckedIndexedAccess": true
}
```

`noUncheckedIndexedAccess` is worth turning on now — the snapshot/restore and traversal code (LS-3/LS-4) index into node arrays heavily, and it catches a class of bugs an agent will otherwise ship.

---

## 5. Establish the folder layout the specs reference

The LS-4/LS-6 specs reference concrete paths. Create them now so co-located specs and module imports line up. Keep Plugma's two **entry files** where they are; put our modules in subfolders the entries import from:

```
localesync/
├─ manifest.json                 # (or manifest block in package.json)
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ SETUP.md                      # this file
├─ src/
│  ├─ main.ts                    # ⚠ Plugma main-thread entry — imports from src/main/*
│  ├─ ui.tsx                     # ⚠ Plugma UI entry — imports from src/ui/*
│  ├─ common/
│  │  └─ messages.ts             # LS-2 shared discriminated union (both sides import this)
│  ├─ main/
│  │  ├─ traversal/              # LS-3
│  │  └─ snapshot/               # LS-4  (+ SPEC.md once written)
│  └─ ui/
│     ├─ shell/                  # LS-5
│     └─ export/                 # LS-6  (+ SPEC.md once written)
├─ fixtures/                     # test fixtures (export-cases.json, snapshot-restore.fig, …)
│  └─ expected/                  # golden files for LS-6
└─ docs/
   ├─ agent-guidelines.md        # cross-cutting conventions + Figma API pins (next step in the plan)
   └─ specs/                     # per-issue specs for the ready tier
```

```bash
mkdir -p src/common src/main/traversal src/main/snapshot src/ui/shell src/ui/export fixtures/expected docs/specs
```

**⚠ confirm:** match the actual entry filenames — if the template generated `code.ts` instead of `main.ts`, keep its name and just point its imports at `src/main/*`. Don't rename the entry files unless you also update the manifest `main`/`ui` keys.

---

## 6. Verify the dev loop in Figma

```bash
npm run dev      # = plugma dev
```

- Note the local preview URL Plugma prints (browser preview of the UI — useful for design iteration without Figma).
- In the **Figma desktop app**: open any file → right-click → `Plugins` → `Development` → `Import plugin from manifest…` → select the manifest Plugma generates (**⚠ confirm** the path — check Plugma's terminal output / the `dist/` folder).
- Run the plugin (`Plugins` → `Development` → LocaleSync). The template UI should appear.
- Edit a string in the UI entry file and save — the UI should hot-reload **without** re-importing. That confirms HMR.

---

## 7. Verify the production build

```bash
npm run build    # = plugma build
```

Confirm the output (typically `dist/`) contains the bundled main-thread JS, a **single inlined** `ui.html`, and a `manifest.json` whose `networkAccess.allowedDomains` reads `["none"]` (no dev domains leaked).

---

## 8. Initialise git and push

```bash
# .gitignore — create if the template didn't
printf "node_modules/\ndist/\n.env\n.DS_Store\n" > .gitignore

git init
git add .
git commit -m "chore: scaffold LocaleSync plugin (Plugma, React+Vite+TS) — LS-1"
git branch -M main
git remote add origin git@github.com:<you>/localesync.git
git push -u origin main
```

---

## 9. LS-1 acceptance (the issue is done when all pass)

- [ ] A teammate can `git clone`, `npm install`, `npm run dev`, import the manifest, and see the plugin run — using only the commands in this file.
- [ ] `npm run build` completes with **no TypeScript errors** and produces `dist/` with an inlined single-file UI.
- [ ] The production `manifest.json` validates with `networkAccess.allowedDomains: ["none"]` and the plugin runs with no CSP/network errors in normal use.
- [ ] `npm run test` runs (zero tests is fine at this point — it just has to exist and exit clean).
- [ ] Folder layout from step 5 exists and entry files import from the subfolders.

---

## What this unblocks

With the tree in place and frozen, the next two plan steps become concrete:

1. **`docs/agent-guidelines.md`** — the cross-cutting conventions + Figma API pins, written once (the close-handler-is-sync rule, never-mutate-missing-font, `figma.mixed` checks, dynamic-page async lookups, the fixture/test conventions).
2. **`docs/specs/` per-issue specs** for the ready tier (LS-6, LS-9, LS-10, LS-12, thin LS-2/3/5), each linking to the guidelines so they stay short.

Don't write co-located specs before this scaffold exists — they'd describe paths that aren't real yet.
