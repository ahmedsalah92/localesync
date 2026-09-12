# Fixtures — inventory & where the `.fig` files live (LS-17 / FIX-1)

`.json` fixtures are generatable; `.fig` fixtures are human-finished in Figma (most are
bootstrapped by the dev-only generator buttons, then completed per their authoring doc). The
`.fig` files are **not committed** — they live in Figma; the links below are the durable handle
(LS-17 acceptance). Links are recorded **bare** (no `?node-id=…&t=…`): the `t=` parameter is a
personal session token, not a share credential, so it does not belong in the repo.

| File | Role / gates | Authoring doc | Generator button | Link |
|---|---|---|---|---|
| `kitchen-sink.fig` | Traversal edge cases → LS-3 | `kitchen-sink.md` | — (hand-built) | <https://www.figma.com/design/202FYO81m07ooYbTAwQ1p9/kitchen-sink.fig> |
| `snapshot-restore.fig` | Byte-identical restore proof → LS-4 | `snapshot-restore.md` | **Generate snapshot-restore** | <https://www.figma.com/design/K8TMI8Hru5B2RMTgXr1zvQ/snapshot-restore.fig> |
| `overflow-spike.fig` | LS-7 spike validation; **promoted to the LS-8 acceptance fixture** (the `known-overflow` role from LS-17) — extend with additional real-world rows when LS-8 starts | `overflow-spike.md` | **Generate overflow-spike** | <https://www.figma.com/design/HiLWfAMbi4oRgjoKys6aCa/overflow-spike.fig> |
| `large-file.fig` | ≈1500 text nodes for the LS-15 performance pass | `large-file.md` | **Generate large-file** | <https://www.figma.com/design/t7vi7mnvpFH0eQtG0fZSsU/> (still titled "Untitled" — rename to `large-file.fig`) |
| `extract-keys.fig` | Key persistence, ownership, eligibility and undo grouping → LS-9. **Writes plugin data** — never reuse another fixture for it | `extract-keys.md` | **Generate extract-keys** | <https://www.figma.com/design/VcmOkAgmRfRZq0Xi4xvqXe/extract-keys.fig> |
| `export-cases.fig` | The 42 `export-cases.json` values as text layers, so **Gleef can be run over them** — this is what anchors the LS-6 escaping rules and the LS-18 goldens. No authoring doc: the generator builds every row and reads them all back, so nothing is finished by hand | `export-cases.json` (the case set) | **Generate export-cases** | <https://www.figma.com/design/fFSLsOhiYkSpFiJOUgAkIl/export-cases.fig> |

`extract-cases.json` is the LS-9 §3.2 derivation table, transcribed for `src/main/extract/key.test.ts`.
The spec table is the authority; regenerate from it rather than editing the JSON on its own.

`export-cases.json` is the LS-18 (FIX-2) export case set — 42 keyed strings covering the escaping,
placeholder-preservation, Unicode, dedup and key-shape edge cases the three exporters must survive.
**Its authority runs the other way for now:** it was authored *before* `docs/specs/LS-6.md` exists,
because it is the input fed through Gleef to anchor that spec's escaping rules and JSON shape. Once
LS-6 §3 lands, the spec table becomes the authority and this file reverts to being its transcription,
like `extract-cases.json`. Keys are LS-9's `dot` scheme throughout and stay LS-9's — only output
shape and escaping are Gleef-anchored. The golden outputs it is diffed against land in
`fixtures/expected/`, which closes LS-18.

`pseudoloc-cases.json` is the LS-10 §3.2 transform table, transcribed for
`src/main/overflow/expand.test.ts`. The spec table is the authority; regenerate from it rather than
editing the JSON on its own. Every expected value was **computed from the §2 rules rather than
hand-written**, which is how §2.11a (trim the padding run before applying markers) was found — the
phrase path prepends a space per word, so an exact-deficit slice can end on one and put a double
space inside `[[ … ]]`.

`expected/` holds the LS-18 golden outputs — `translations.json`, `Localizable.strings`,
`strings.xml` — derived from `docs/specs/LS-6.md` §2, never hand-typed (agent-guidelines §6). They
carry **no comments and no trailing newline**, because they are diffed byte-for-byte against
serializer output that emits neither. Verified 2026-09-12: JSON parses and all 41 values round-trip
(#1 `home.title` is omitted by design per §2.1.2); `strings.xml` parses under `fast-xml-parser`, all
42 values round-trip through XML plus Android unescaping, and every resource name matches
`[a-zA-Z][a-zA-Z0-9_]*`; `Localizable.strings` passes `plutil -lint` and all 42 values round-trip
through Apple's own parser. **`strings.xml` also compiles and links under real aapt2**, with all 42
values recovered byte-identical from Android's own string pool — run `npm run check:android`, which
prints how to fetch aapt2 (a standalone ~4MB Maven artifact, no Android SDK) when it cannot find it.

**Link access:** these are personal drafts by default (private to the owner). Before anyone else
needs them, set each file's Share → link access to *Anyone with the link → can view*, or move it
into a team project.

Verdict vocabulary and per-mode overflow rules: `docs/specs/LS-7.md` (the closed spike decision
doc). Fixture conventions: `docs/agent-guidelines.md` §6.
