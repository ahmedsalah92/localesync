/**
 * The 2px determinate/indeterminate bar the summary band rides on its bottom edge.
 *
 * `'indeterminate'` is not "zero progress": it is the state before the engine's first progress
 * tick carries a non-zero `total`, where no ratio exists yet. It drops `aria-valuenow` — the ARIA
 * contract for a progressbar of unknown extent — rather than reporting a 0 it cannot stand behind.
 */
export function ProgressBar(props: { value: number | 'indeterminate' }) {
	// Destructured so the `indeterminate` alias narrows `value` for the ratio below; TS does not
	// carry an aliased discriminant through a property access on `props`.
	const { value } = props;
	const indeterminate = value === 'indeterminate';
	const pct = indeterminate ? 0 : Math.max(0, Math.min(1, value)) * 100;

	return (
		<div
			role="progressbar"
			aria-valuenow={indeterminate ? undefined : Math.round(pct)}
			aria-valuemin={0}
			aria-valuemax={100}
			style={{
				position: 'relative',
				height: 2,
				width: '100%',
				overflow: 'hidden',
				backgroundColor: 'var(--ls-bg-secondary)',
			}}
		>
			<div
				style={{
					position: 'absolute',
					top: 0,
					bottom: 0,
					backgroundColor: 'var(--ls-bg-brand)',
					...(indeterminate
						? { width: '40%', animation: 'ls-progress-indeterminate 1.1s ease-in-out infinite' }
						: { left: 0, width: `${pct}%` }),
				}}
			/>
		</div>
	);
}
