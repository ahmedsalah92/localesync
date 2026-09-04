import { useState } from 'react';
import { AppliedBanner } from './AppliedBanner';
import { AppliedProvider } from './applied';
import { PANELS, type PanelDef, type PanelId } from './panels';
import { ResultsList } from './ResultsList';
import { selectPanel } from './tabs';
import { TabBar } from './TabBar';

function ShellBody(props: { panels: readonly PanelDef[]; initialPanel?: PanelId }) {
	const firstId = props.panels[0]?.id ?? 'overflow';
	const [activeId, setActiveId] = useState<PanelId>(props.initialPanel ?? firstId);

	const active = selectPanel(props.panels, activeId);
	const Panel = active.Panel;
	const Footer = active.Footer ?? null;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
			<AppliedBanner />
			<TabBar panels={props.panels} activePanel={activeId} onSelect={setActiveId} />
			<div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
				<ResultsList hasFooter={Footer !== null}>
					<Panel />
				</ResultsList>
				{Footer ? (
					<div style={{ height: 40, flexShrink: 0 }}>
						<Footer />
					</div>
				) : null}
			</div>
		</div>
	);
}

export function Shell(props: { panels?: readonly PanelDef[]; initialPanel?: PanelId }) {
	const panels = props.panels ?? PANELS;
	return (
		<AppliedProvider>
			<ShellBody panels={panels} initialPanel={props.initialPanel} />
		</AppliedProvider>
	);
}
