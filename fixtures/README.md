# Fixtures — inventory & where the `.fig` files live (LS-17 / FIX-1)

`.json` fixtures are generatable; `.fig` fixtures are human-finished in Figma (most are
bootstrapped by the dev-only generator buttons, then completed per their authoring doc). The
`.fig` files are **not committed** — record the shared-Figma link (or local path) for each below
so they stay accessible to the team (LS-17 acceptance).

| File | Role / gates | Authoring doc | Generator button | Link / location |
|---|---|---|---|---|
| `kitchen-sink.fig` | Traversal edge cases → LS-3 | `kitchen-sink.md` | — (hand-built) | ________ |
| `snapshot-restore.fig` | Byte-identical restore proof → LS-4 | `snapshot-restore.md` | **Generate snapshot-restore** | ________ |
| `overflow-spike.fig` | LS-7 spike validation; **promoted to the LS-8 acceptance fixture** (the `known-overflow` role from LS-17) — extend with additional real-world rows when LS-8 starts | `overflow-spike.md` | **Generate overflow-spike** | ________ |
| `large-file.fig` | ≈1500 text nodes for the LS-15 performance pass | `large-file.md` | **Generate large-file** | ________ |

Verdict vocabulary and per-mode overflow rules: `docs/specs/LS-7.md` (the closed spike decision
doc). Fixture conventions: `docs/agent-guidelines.md` §6.
