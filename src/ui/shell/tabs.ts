import type { PanelId } from './panels';

/**
 * The "tab reducer" the mechanical checks name (docs/specs/LS-5.md §3): selecting a `PanelId`
 * yields that registry entry. Generic and dependency-free (only a type-only import of `PanelId`,
 * erased at compile time) so it can be unit-tested without pulling in `panels.tsx` — that module
 * imports the dev-only bridge-backed harnesses, which touch `window` at module scope and can't
 * load under Vitest's plain Node environment (docs/agent-guidelines.md §6: no jsdom).
 */
export function selectPanel<T extends { id: PanelId }>(panels: readonly T[], id: PanelId): T {
	const found = panels.find((panel) => panel.id === id);
	if (!found) {
		throw new Error(`Unknown panel id: ${id}`);
	}
	return found;
}
