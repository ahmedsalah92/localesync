import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Applied/restored state, per docs/specs/LS-5.md §1.4 — held per feature since LS-34. `restored` structurally cannot
 * carry an `onRevert` — that is the canvas rule ("Type=Restored" has no action) encoded as a
 * compile-time fact instead of a runtime check.
 */
export type AppliedState =
	/** `busy` disables this row's Revert while the feature has its own command in flight (LS-34). */
	{ kind: 'applied'; message: string; onRevert: () => void; busy?: boolean } | { kind: 'restored'; message: string };

/** The features that can hold an applied row (LS-34). Applied state is per feature, not per tab:
 *  it survives tab switches, and one feature's row can never overwrite or clear another's. */
export type AppliedFeature = 'preview' | 'pseudo' | 'rtl';
export type AppliedMap = Readonly<Record<AppliedFeature, AppliedState | null>>;

/** Tab order, not apply order, so a row never moves when another feature comes or goes. */
export const BANNER_ORDER: readonly AppliedFeature[] = ['preview', 'pseudo', 'rtl'];

const EMPTY: AppliedMap = { preview: null, pseudo: null, rtl: null };

export function withApplied(map: AppliedMap, feature: AppliedFeature, next: AppliedState | null): AppliedMap {
	return { ...map, [feature]: next };
}

/** The same row with its Revert held (or released) — never creates a row, and a restored row has
 *  no Revert to hold. */
export function withBusy(state: AppliedState | null, busy: boolean): AppliedState | null {
	return state === null || state.kind !== 'applied' ? state : { ...state, busy };
}

export function bannerRows(map: AppliedMap): { feature: AppliedFeature; state: AppliedState }[] {
	return BANNER_ORDER.flatMap((feature) => {
		const state = map[feature];
		return state === null ? [] : [{ feature, state }];
	});
}

interface AppliedContextValue {
	map: AppliedMap;
	set: (feature: AppliedFeature, next: AppliedState | null) => void;
}

const AppliedContext = createContext<AppliedContextValue | null>(null);

/** `initial` exists for render tests; the shell mounts it empty. */
export function AppliedProvider(props: {
	children: React.ReactNode;
	initial?: Partial<Record<AppliedFeature, AppliedState | null>>;
}) {
	const [map, setMap] = useState<AppliedMap>(() => ({ ...EMPTY, ...props.initial }));
	// Stable, and a functional update: a panel's listener registered once can hold it without ever
	// writing a stale map over a newer one.
	const set = useCallback((feature: AppliedFeature, next: AppliedState | null) => {
		setMap((current) => withApplied(current, feature, next));
	}, []);
	const value = useMemo(() => ({ map, set }), [map, set]);
	return <AppliedContext.Provider value={value}>{props.children}</AppliedContext.Provider>;
}

function useAppliedContext(): AppliedContextValue {
	const ctx = useContext(AppliedContext);
	if (!ctx) {
		throw new Error('useApplied must be used within an AppliedProvider');
	}
	return ctx;
}

/** One feature's row. `setApplied` is stable across renders and can only touch this feature. */
export function useApplied(feature: AppliedFeature): {
	applied: AppliedState | null;
	setApplied: (next: AppliedState | null) => void;
} {
	const { map, set } = useAppliedContext();
	const setApplied = useCallback((next: AppliedState | null) => set(feature, next), [set, feature]);
	return { applied: map[feature], setApplied };
}

/** Every row, for the banner. */
export function useAppliedRows(): { feature: AppliedFeature; state: AppliedState }[] {
	return bannerRows(useAppliedContext().map);
}
