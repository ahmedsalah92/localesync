// src/ui/App.tsx
import { runRoundtrip } from './roundtrip';

export default function App() {
	return (
		<div style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}>
			LocaleSync
			{import.meta.env.DEV && (
				<button type="button" onClick={() => void runRoundtrip()} style={{ display: 'block', marginTop: 8 }}>
					__test:roundtrip
				</button>
			)}
		</div>
	);
}
