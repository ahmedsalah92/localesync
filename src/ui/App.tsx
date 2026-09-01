// src/ui/App.tsx
import { runOverflowCheck } from './overflow-check';
import { runRoundtrip } from './roundtrip';
import { runSnapshotCheck } from './snapshot-check';
import { runTraversalCheck } from './traversal-check';

// No font-family on the root div — the plugin surface is UI3, and `:root` in styles.css already
// carries the Inter/system stack. A brand face on plugin chrome is agent-guidelines §7.
export default function App() {
	return (
		<div>
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
					<button
						type="button"
						onClick={() => void runOverflowCheck()}
						style={{ display: 'block', marginTop: 8 }}
					>
						Run LS-8 overflow check
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
					<button
						type="button"
						onClick={() =>
							parent.postMessage({ pluginMessage: { type: '__dev:generate-overflow-spike' } }, '*')
						}
						style={{ display: 'block', marginTop: 8 }}
					>
						Generate overflow-spike
					</button>
					<button
						type="button"
						onClick={() => parent.postMessage({ pluginMessage: { type: '__dev:generate-large-file' } }, '*')}
						style={{ display: 'block', marginTop: 8 }}
					>
						Generate large-file
					</button>
				</>
			)}
		</div>
	);
}
