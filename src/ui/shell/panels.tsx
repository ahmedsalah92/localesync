import type { ComponentType } from 'react';
import { StateView } from './StateView';
import { runOverflowCheck } from '../overflow-check';
import { runRoundtrip } from '../roundtrip';
import { runSnapshotCheck } from '../snapshot-check';
import { runTraversalCheck } from '../traversal-check';

export type PanelId = 'overflow' | 'extract' | 'preview' | 'pseudo' | 'rtl';

export interface PanelDef {
	id: PanelId;
	label: string;
	Panel: ComponentType;
	Footer?: ComponentType | null;
}

/** LS-13 fills these in; a Pro-stub placeholder holds the footer band's shape until then. */
function makeFooterStub(name: string): ComponentType {
	return function FooterStub() {
		return (
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					padding: `0 var(--spacer-3)`,
					fontSize: 'var(--ls-text-size)',
					lineHeight: 'var(--ls-text-line)',
					letterSpacing: 'var(--ls-text-tracking)',
					color: 'var(--ls-text-tertiary)',
				}}
			>
				{name}
			</div>
		);
	};
}

/** The feature body of each panel is owned by its feature issue (LS-6/8/10/11/12); until that
 * lands, LS-5 ships a stub that mounts the shell's `first-run` state so the tab has something
 * real to show. */
function makeStubPanel(label: string): ComponentType {
	return function StubPanel() {
		return (
			<StateView
				state="first-run"
				headline={label}
				body="This panel hasn't been wired up yet."
			/>
		);
	};
}

/**
 * The overflow stub also carries the dev-only LS-2/3/4/8 acceptance harnesses that used to live
 * directly in App.tsx — moved here so App.tsx can match its spec contract ("renders <Shell /> and
 * nothing else") without dropping working acceptance tooling other issues depend on.
 */
function OverflowStubPanel() {
	return (
		<>
			<StateView state="first-run" headline="Overflow" body="This panel hasn't been wired up yet." />
			{import.meta.env.DEV && (
				<div style={{ padding: 'var(--spacer-3)', display: 'flex', flexDirection: 'column', gap: 'var(--spacer-1)' }}>
					<button type="button" onClick={() => void runRoundtrip()}>
						__test:roundtrip
					</button>
					<button type="button" onClick={() => void runTraversalCheck()}>
						__test:traversal
					</button>
					<button type="button" onClick={() => void runSnapshotCheck()}>
						Run LS-4 snapshot check
					</button>
					<button type="button" onClick={() => void runOverflowCheck()}>
						Run LS-8 overflow check
					</button>
					{/* Dev scaffold: raw postMessage of a `__dev:` sentinel intercepted by main.ts's
					    onmessage wrapper. Intentionally bypasses the typed bridge — not feature code. */}
					<button
						type="button"
						onClick={() =>
							parent.postMessage({ pluginMessage: { type: '__dev:generate-snapshot-restore' } }, '*')
						}
					>
						Generate snapshot-restore
					</button>
					<button
						type="button"
						onClick={() => parent.postMessage({ pluginMessage: { type: '__dev:apply-batch-leave' } }, '*')}
					>
						Apply batch (leave applied)
					</button>
					<button
						type="button"
						onClick={() =>
							parent.postMessage({ pluginMessage: { type: '__dev:generate-overflow-spike' } }, '*')
						}
					>
						Generate overflow-spike
					</button>
					<button
						type="button"
						onClick={() => parent.postMessage({ pluginMessage: { type: '__dev:generate-large-file' } }, '*')}
					>
						Generate large-file
					</button>
				</div>
			)}
		</>
	);
}

/** Registry order is tab order, left to right. One entry per feature issue. */
export const PANELS: readonly PanelDef[] = [
	{
		id: 'overflow',
		label: 'Overflow',
		Panel: OverflowStubPanel,
		Footer: makeFooterStub('Matrix'),
	},
	{
		id: 'extract',
		label: 'Extract',
		Panel: makeStubPanel('Extract'),
		Footer: makeFooterStub('Report'),
	},
	{
		id: 'preview',
		label: 'Preview',
		Panel: makeStubPanel('Preview'),
		Footer: makeFooterStub('Translate'),
	},
	{
		id: 'pseudo',
		label: 'Pseudo',
		Panel: makeStubPanel('Pseudo'),
		Footer: null,
	},
	{
		id: 'rtl',
		label: 'RTL',
		Panel: makeStubPanel('RTL'),
		Footer: makeFooterStub('Sync'),
	},
];
