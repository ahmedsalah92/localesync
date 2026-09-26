import { useAppliedRows } from './applied';

/**
 * The 40px banner at y=40 (docs/specs/LS-5.md §2.1) — one row per applied feature, stacked in tab
 * order (LS-34), rendered only when at least one feature is applied. The
 * word "Revert" is the one piece of copy LS-5 has to own directly: `AppliedState` carries
 * `onRevert` but no label string, so the contract itself leaves no other option.
 */
export function AppliedBanner() {
	const rows = useAppliedRows();
	if (rows.length === 0) return null;

	return (
		<>
			{rows.map(({ feature, state }) => (
				<div
					key={feature}
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						height: 40,
						flexShrink: 0,
						padding: `var(--spacer-2) var(--spacer-3)`,
						borderLeft: '3px solid var(--ls-border-selected-strong)',
						backgroundColor: 'var(--ls-bg-info)',
					}}
				>
					<span
						style={{
							fontSize: 'var(--ls-text-size)',
							lineHeight: 'var(--ls-text-line)',
							letterSpacing: 'var(--ls-text-tracking)',
							fontWeight: 'var(--ls-text-weight)',
							color: 'var(--ls-text-default)',
						}}
					>
						{state.message}
					</span>
					{state.kind === 'applied' && (
						<button
							type="button"
							onClick={state.onRevert}
							disabled={state.busy === true}
							style={{
								fontSize: 'var(--ls-text-size)',
								lineHeight: 'var(--ls-text-line)',
								letterSpacing: 'var(--ls-text-tracking)',
								fontWeight: 'var(--ls-text-weight-strong)',
								color: state.busy === true ? 'var(--ls-text-tertiary)' : 'var(--ls-text-brand)',
							}}
						>
							Revert
						</button>
					)}
				</div>
			))}
		</>
	);
}
