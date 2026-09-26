import { useEffect, useState } from 'react';
import { request } from '../bridge';
import { setFirstScanDone, track } from '../telemetry';
import { AppliedBanner } from './AppliedBanner';
import { AppliedProvider } from './applied';
import { DevHarness } from '../devtools/DevHarness';
import { PANELS, type PanelDef, type PanelId } from './panels';
import { panelVisibility } from './tabs';
import { TabBar } from './TabBar';
import { ResizeHandle } from './ResizeHandle';

function ShellBody(props: { panels: readonly PanelDef[]; initialPanel?: PanelId }) {
	const firstId = props.panels[0]?.id ?? 'overflow';
	const [activeId, setActiveId] = useState<PanelId>(props.initialPanel ?? firstId);

	// LS-13 §2.4: once per launch — the shell and every panel mount once (LS-34). Best-effort: a
	// failure leaves first_scan suppressed and never blocks the plugin.
	useEffect(() => {
		request('telemetry-state-request', {}).then(
			(state) => {
				setFirstScanDone(state.firstScanDone);
				if (state.firstLaunch) track({ name: 'install' });
			},
			() => {},
		);
	}, []);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
			<AppliedBanner />
			<TabBar panels={props.panels} activePanel={activeId} onSelect={setActiveId} />
			{/* Everything below the tab bar belongs to the panel: its own bands, its scroll region,
			    its footer (LS-8.2 §1.7). The shell used to render <Panel /> *inside* ResultsList, so
			    a panel with pinned control and summary bars could not exist — its bands would scroll
			    away with its rows. The column context stays the shell's; the contents do not. */}
			{panelVisibility(props.panels, activeId).map(({ panel, visible }) => (
				// Every panel stays mounted; the inactive ones are hidden, which also takes them out of
				// the Tab order and the accessibility tree. Unmounting on a tab switch lost a panel's
				// state and orphaned its listeners, so a banner Revert from another tab never cleared (LS-34).
				<div
					key={panel.id}
					hidden={!visible}
					style={{ flex: 1, minHeight: 0, display: visible ? 'flex' : 'none', flexDirection: 'column' }}
				>
					<panel.Panel />
				</div>
			))}
			<ResizeHandle />
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
