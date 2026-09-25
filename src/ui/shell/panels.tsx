import type { ComponentType } from 'react';
import { ExtractPanel } from '../extract/ExtractPanel';
import { OverflowPanel } from '../overflow/OverflowPanel';
import { PreviewPanel } from '../preview/PreviewPanel';
import { PseudoPanel } from '../pseudo/PseudoPanel';
import { RtlPanel } from '../rtl/RtlPanel';

export type PanelId = 'overflow' | 'extract' | 'preview' | 'pseudo' | 'rtl';

export interface PanelDef {
	id: PanelId;
	label: string;
	/**
	 * Owns everything below the tab bar — its own bands, its scroll region, and its footer.
	 *
	 * LS-5 had the shell render the footer from a `PanelDef.Footer` and the panel body inside
	 * `ResultsList`. LS-8.2 §1.7 removes both: a panel with pinned control and summary bars cannot
	 * exist inside the scroll container, and the same structure is why a panel could not hide its
	 * footer, which the canvas requires in every empty state and throughout scanning.
	 */
	Panel: ComponentType;
}

/** Registry order is tab order, left to right. One entry per feature issue. */
export const PANELS: readonly PanelDef[] = [
	{ id: 'overflow', label: 'Overflow', Panel: OverflowPanel },
	{ id: 'extract', label: 'Extract', Panel: ExtractPanel },
	{ id: 'preview', label: 'Preview', Panel: PreviewPanel },
	// No fifth paid pillar — the absence is principled, not an omission (LS-5 §2.2).
	{ id: 'pseudo', label: 'Pseudo', Panel: PseudoPanel },
	{ id: 'rtl', label: 'RTL', Panel: RtlPanel },
];
