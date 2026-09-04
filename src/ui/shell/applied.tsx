import React, { createContext, useContext, useMemo, useState } from 'react';

/**
 * Plugin-wide applied/restored state, per docs/specs/LS-5.md §1.4. `restored` structurally cannot
 * carry an `onRevert` — that is the canvas rule ("Type=Restored" has no action) encoded as a
 * compile-time fact instead of a runtime check.
 */
export type AppliedState =
	| { kind: 'applied'; message: string; onRevert: () => void }
	| { kind: 'restored'; message: string };

interface AppliedContextValue {
	applied: AppliedState | null;
	setApplied: (next: AppliedState | null) => void;
}

const AppliedContext = createContext<AppliedContextValue | null>(null);

export function AppliedProvider(props: { children: React.ReactNode }) {
	const [applied, setApplied] = useState<AppliedState | null>(null);
	const value = useMemo(() => ({ applied, setApplied }), [applied]);
	return <AppliedContext.Provider value={value}>{props.children}</AppliedContext.Provider>;
}

export function useApplied(): AppliedContextValue {
	const ctx = useContext(AppliedContext);
	if (!ctx) {
		throw new Error('useApplied must be used within an AppliedProvider');
	}
	return ctx;
}
