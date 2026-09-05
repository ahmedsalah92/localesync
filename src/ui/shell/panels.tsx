import type { ComponentType } from 'react';
import { FooterStub } from './FooterStub';
import { ResultsList } from './ResultsList';
import { StateView } from './StateView';

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

/** The feature body of each panel is owned by its feature issue (LS-6/10/11/12); until that lands,
 * a stub mounts the shell's `first-run` state so the tab has something real to show. It composes
 * the same tree the shell used to build around it — `ResultsList` plus the Pro-stub footer — so
 * the four stub panels look identical before and after the §1.7 restructure. */
function makeStubPanel(label: string, footer: string | null): ComponentType {
	return function StubPanel() {
		return (
			<>
				<ResultsList hasFooter={footer !== null}>
					<StateView state="first-run" headline={label} body="This panel hasn't been wired up yet." />
				</ResultsList>
				{footer !== null ? <FooterStub name={footer} /> : null}
			</>
		);
	};
}

/** Registry order is tab order, left to right. One entry per feature issue. */
export const PANELS: readonly PanelDef[] = [
	{ id: 'overflow', label: 'Overflow', Panel: makeStubPanel('Overflow', 'Matrix') },
	{ id: 'extract', label: 'Extract', Panel: makeStubPanel('Extract', 'Report') },
	{ id: 'preview', label: 'Preview', Panel: makeStubPanel('Preview', 'Translate') },
	// No fifth paid pillar — the absence is principled, not an omission (LS-5 §2.2).
	{ id: 'pseudo', label: 'Pseudo', Panel: makeStubPanel('Pseudo', null) },
	{ id: 'rtl', label: 'RTL', Panel: makeStubPanel('RTL', 'Sync') },
];
