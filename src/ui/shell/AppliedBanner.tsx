import { useApplied } from './applied';

/**
 * The 40px banner at y=40, rendered only when `applied !== null` (docs/specs/LS-5.md §2.1). The
 * word "Revert" is the one piece of copy LS-5 has to own directly: `AppliedState` carries
 * `onRevert` but no label string, so the contract itself leaves no other option.
 */
export function AppliedBanner() {
	const { applied } = useApplied();
	if (!applied) return null;

	return (
		<div
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
				{applied.message}
			</span>
			{applied.kind === 'applied' && (
				<button
					type="button"
					onClick={applied.onRevert}
					style={{
						fontSize: 'var(--ls-text-size)',
						lineHeight: 'var(--ls-text-line)',
						letterSpacing: 'var(--ls-text-tracking)',
						fontWeight: 'var(--ls-text-weight-strong)',
						color: 'var(--ls-text-brand)',
					}}
				>
					Revert
				</button>
			)}
		</div>
	);
}
