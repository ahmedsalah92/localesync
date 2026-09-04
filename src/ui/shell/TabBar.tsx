import type { PanelDef, PanelId } from './panels';

export function TabBar(props: { panels: readonly PanelDef[]; activePanel: PanelId; onSelect: (id: PanelId) => void }) {
	return (
		<div style={{ display: 'flex', height: 40, flexShrink: 0 }}>
			{props.panels.map((panel) => {
				const active = panel.id === props.activePanel;
				return (
					<button
						key={panel.id}
						type="button"
						onClick={() => props.onSelect(panel.id)}
						style={{
							flex: '1 1 80px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							borderBottom: active ? '2px solid var(--ls-border-selected-strong)' : '2px solid transparent',
							color: active ? 'var(--ls-text-default)' : 'var(--ls-text-secondary)',
							fontSize: 'var(--ls-text-size)',
							lineHeight: 'var(--ls-text-line)',
							letterSpacing: 'var(--ls-text-tracking)',
							fontWeight: 'var(--ls-text-weight)',
						}}
					>
						{panel.label}
					</button>
				);
			})}
		</div>
	);
}
