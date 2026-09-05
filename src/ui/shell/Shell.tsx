import { useState } from 'react';
import { AppliedBanner } from './AppliedBanner';
import { AppliedProvider } from './applied';
import { DevHarness } from '../devtools/DevHarness';
import { PANELS, type PanelDef, type PanelId } from './panels';
import { selectPanel } from './tabs';
import { TabBar } from './TabBar';

function ShellBody(props: { panels: readonly PanelDef[]; initialPanel?: PanelId }) {
	const firstId = props.panels[0]?.id ?? 'overflow';
	const [activeId, setActiveId] = useState<PanelId>(props.initialPanel ?? firstId);

	const Panel = selectPanel(props.panels, activeId).Panel;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
			<AppliedBanner />
			<TabBar panels={props.panels} activePanel={activeId} onSelect={setActiveId} />
			{/* Everything below the tab bar belongs to the panel: its own bands, its scroll region,
			    its footer (LS-8.2 §1.7). The shell used to render <Panel /> *inside* ResultsList, so
			    a panel with pinned control and summary bars could not exist — its bands would scroll
			    away with its rows. The column context stays the shell's; the contents do not. */}
			<div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
				<Panel />
			</div>
			{import.meta.env.DEV && <DevHarness />}
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
