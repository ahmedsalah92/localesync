/**
 * UI3 `Switch`, as composed into `Menu row/Toggle` — the dedup control in the Export modal
 * (node I588:24;2015:24721 in UlcEw6zdZzpIpxqrBz4X53).
 *
 * Geometry is the canvas component's, not invented: a 32×16 track at `--radius-full`, a 14px knob
 * inset 1px and vertically centred. Off is `bg/tertiary`; on is `bg/brand`. The knob is
 * `icon/onbrand`.
 *
 * Introduced by LS-6 and placed here rather than in `src/ui/export/` because it is a kit primitive,
 * not an export concern — LS-10's pseudo-loc panel needs three of them (accent, brackets, boundary
 * markers) and LS-11's RTL panel one more.
 *
 * A real `<input type="checkbox">` carries the semantics; the visual track and knob are painted over
 * it. That keeps keyboard focus, the space-bar toggle and screen-reader state for free rather than
 * reimplementing them on a `<div role="switch">`.
 */
export function Switch(props: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
	return (
		<span
			style={{
				position: 'relative',
				flexShrink: 0,
				display: 'inline-flex',
				width: 32,
				height: 16,
			}}
		>
			<input
				type="checkbox"
				role="switch"
				checked={props.checked}
				disabled={props.disabled}
				aria-label={props.label}
				onChange={(event) => props.onChange(event.currentTarget.checked)}
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					margin: 0,
					opacity: 0,
					cursor: props.disabled === true ? 'default' : 'pointer',
				}}
			/>
			<span
				aria-hidden="true"
				style={{
					width: 32,
					height: 16,
					borderRadius: 'var(--radius-full)',
					backgroundColor: props.checked ? 'var(--ls-bg-brand)' : 'var(--ls-bg-tertiary)',
					opacity: props.disabled === true ? 0.4 : 1,
					transition: 'background-color 100ms linear',
				}}
			>
				<span
					style={{
						position: 'absolute',
						top: '50%',
						transform: 'translateY(-50%)',
						left: props.checked ? 17 : 1,
						width: 14,
						height: 14,
						borderRadius: 'var(--radius-full)',
						backgroundColor: 'var(--ls-icon-onbrand)',
						transition: 'left 100ms linear',
					}}
				/>
			</span>
		</span>
	);
}
