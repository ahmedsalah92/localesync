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

**Link access:** these are personal drafts by default (private to the owner). Before anyone else
needs them, set each file's Share → link access to *Anyone with the link → can view*, or move it
into a team project.

Verdict vocabulary and per-mode overflow rules: `docs/specs/LS-7.md` (the closed spike decision
doc). Fixture conventions: `docs/agent-guidelines.md` §6.
