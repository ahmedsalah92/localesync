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

/** Every panel, in registry order, with whether it is the visible one. The shell renders all of
 *  them and hides the rest, so no panel unmounts on a tab switch and none loses its state or its
 *  message listeners (LS-34). Throws on an unknown id, exactly as selectPanel does. */
export function panelVisibility<T extends { id: PanelId }>(
	panels: readonly T[],
	activeId: PanelId,
): { panel: T; visible: boolean }[] {
	selectPanel(panels, activeId);
	return panels.map((panel) => ({ panel, visible: panel.id === activeId }));
}
