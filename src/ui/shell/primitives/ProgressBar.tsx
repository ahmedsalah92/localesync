export function ProgressBar(props: { value: number }) {
	const pct = Math.max(0, Math.min(1, props.value)) * 100;
	return (
		<div
			role="progressbar"
			aria-valuenow={Math.round(pct)}
			aria-valuemin={0}
			aria-valuemax={100}
			style={{
				position: 'relative',
				height: 2,
				width: '100%',
				backgroundColor: 'var(--ls-bg-secondary)',
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					bottom: 0,
					width: `${pct}%`,
					backgroundColor: 'var(--ls-bg-brand)',
				}}
			/>
		</div>
	);
}
