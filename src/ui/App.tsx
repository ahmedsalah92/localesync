// src/ui/App.tsx
import { runRoundtrip } from './roundtrip';
import { runSnapshotCheck } from './snapshot-check';
import { runTraversalCheck } from './traversal-check';

export default function App() {
	return (
		<div style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}>
			LocaleSync
			{import.meta.env.DEV && (
				<>
					<button
						type="button"
						onClick={() => void runRoundtrip()}
						style={{ display: 'block', marginTop: 8 }}
					>
						__test:roundtrip
					</button>
					<button
						type="button"
						onClick={() => void runTraversalCheck()}
						style={{ display: 'block', marginTop: 8 }}
					>
						__test:traversal
					</button>
					<button
						type="button"
						onClick={() => void runSnapshotCheck()}
						style={{ display: 'block', marginTop: 8 }}
					>
						Run LS-4 snapshot check
					</button>
					{/* Dev scaffold: raw postMessage of a `__dev:` sentinel intercepted by main.ts's
					    onmessage wrapper. Intentionally bypasses the typed bridge — not feature code. */}
					<button
						type="button"
						onClick={() =>
							parent.postMessage({ pluginMessage: { type: '__dev:generate-snapshot-restore' } }, '*')
						}
						style={{ display: 'block', marginTop: 8 }}
					>
						Generate snapshot-restore
					</button>
					<button
						type="button"
						onClick={() => parent.postMessage({ pluginMessage: { type: '__dev:apply-batch-leave' } }, '*')}
						style={{ display: 'block', marginTop: 8 }}
					>
						Apply batch (leave applied)
					</button>
				</>
			)}
		</div>
	);
}
