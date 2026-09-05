import { runBridgeRegression, runOverflowCheck } from '../overflow-check';
import { runRoundtrip } from '../roundtrip';
import { runSnapshotCheck } from '../snapshot-check';
import { runTraversalCheck } from '../traversal-check';

/**
 * The dev-only LS-2/3/4/8 acceptance harnesses. Rendered by `Shell` behind `import.meta.env.DEV`;
 * never present in a production build.
 *
 * These lived in `panels.tsx`'s overflow stub, which only ever hosted them because that tab had no
 * real content — three of the four are not overflow-specific at all. LS-8.2 replaces that stub with
 * the real panel, so they move here rather than into feature code: `panels.tsx` goes back to being
 * a registry, and `App.tsx` keeps its "renders <Shell /> and nothing else" contract (LS-5 §1.3).
 *
 * Pinned out of flow, because the §3.4 canvas review is executed under `npm run dev` and an in-flow
 * dev band would sit between the reviewer and the thing being reviewed.
 */
export function DevHarness() {
	return (
		<details
			style={{
				position: 'fixed',
				right: 'var(--spacer-1)',
				bottom: 'var(--spacer-1)',
				zIndex: 1,
				padding: 'var(--spacer-1)',
				borderRadius: 'var(--radius-small)',
				border: '1px solid var(--ls-border-default)',
				backgroundColor: 'var(--ls-bg-default)',
				fontSize: 'var(--ls-text-size)',
				lineHeight: 'var(--ls-text-line)',
				letterSpacing: 'var(--ls-text-tracking)',
				color: 'var(--ls-text-tertiary)',
			}}
		>
			<summary style={{ cursor: 'pointer' }}>dev</summary>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-1)', paddingTop: 'var(--spacer-1)' }}>
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
				{/* Needs a file of MORE than 25 nodes (PROGRESS_EVERY) — run against large-file.fig,
				    not overflow-spike.fig, whose 14 rows never reach the first progress tick. */}
				<button type="button" onClick={() => void runBridgeRegression()}>
					Run LS-8.2 bridge regression (large-file)
				</button>
				{/* Dev scaffold: raw postMessage of a `__dev:` sentinel intercepted by main.ts's
				    onmessage wrapper. Intentionally bypasses the typed bridge — not feature code. */}
				<button
					type="button"
					onClick={() => parent.postMessage({ pluginMessage: { type: '__dev:generate-snapshot-restore' } }, '*')}
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
					onClick={() => parent.postMessage({ pluginMessage: { type: '__dev:generate-overflow-spike' } }, '*')}
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
		</details>
	);
}
