# `fixtures/large-file.fig` — authoring checklist (LS-17, consumed by LS-15)

Performance-benchmarking fixture: **≈1500 text nodes** (issue target 1–2k) with realistic
variety — mixed resize modes (`NONE` / `HEIGHT` / `WIDTH_AND_HEIGHT`), ~25% truncating, varied
string lengths, plain + auto-layout frames, and ~20% of nodes inside instances (traversal
descends into instances).

**Fully scriptable — no manual steps.** Build: `npm run dev` → fresh empty Figma file → dev-only
**Generate large-file** button → console reports the exact node count → save as
`fixtures/large-file.fig` (or record the shared link in `fixtures/README.md`).

Composition (from `src/main/devtools/generateLargeFile.ts`):

- 90 plain frames × 12 texts = 1080
- 10 auto-layout frames × 12 texts = 120
- 1 component (5 texts) + 59 instances × 5 = 300

Total: 1500 (the generator counts the real total via `findAllWithCriteria` and logs it).

## Done when

- [x] Generator run reports ≈1500 text nodes (anything in 1–2k passes the LS-17 criterion).
      *(Console line still wasn't captured, but verified 2026-09-02 by counting the live file via
      Figma metadata inspection instead: 90 plain frames + 10 auto-layout frames (exact match),
      1 component symbol, 59 instances (exact match) — composition matches
      `generateLargeFile.ts` exactly, totaling ≈1500 text nodes.)*
- [ ] File renamed from "Untitled" to `large-file.fig`.
      *(Still unconfirmed — the page inside the file is named `large-file`, but the file's own
      title isn't visible to metadata inspection or an unauthenticated fetch of the link; the
      `fixtures/README.md` note that it's still "Untitled" hasn't been contradicted.)*
- [x] File saved and its link recorded in `fixtures/README.md`.
- [ ] LS-15 uses it for scan/measure benchmarking (its acceptance owns the timing targets).
      *(No LS-15 work exists in the repo yet.)*
