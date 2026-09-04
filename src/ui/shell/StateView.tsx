/**
 * The seven-state empty/error view, per docs/specs/LS-5.md §1.7 and the `Plugin Shell — States`
 * component set (canvas `289:1420`). Copy (headline/body/action label) is always caller-supplied —
 * LS-5 owns none of it (docs/specs/LS-5.md §0).
 */
export type ShellState =
	| 'first-run'
	| 'no-selection'
	| 'no-text-on-page'
	| 'fonts-unavailable'
	| 'large-file'
	| 'scan-stopped'
	| 'operation-failed';

export function StateView(props: {
	state: ShellState;
	headline: string;
	body: string;
	action?: { label: string; onClick: () => void };
}) {
	return (
		<div
			data-state={props.state}
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 'var(--spacer-2)',
				height: '100%',
				padding: 'var(--spacer-4)',
				textAlign: 'center',
			}}
		>
			<div
				style={{
					fontSize: 'var(--ls-text-size)',
					lineHeight: 'var(--ls-text-line)',
					letterSpacing: 'var(--ls-text-tracking)',
					fontWeight: 'var(--ls-text-weight-strong)',
					color: 'var(--ls-text-default)',
				}}
			>
				{props.headline}
			</div>
			<div
				style={{
					fontSize: 'var(--ls-text-size)',
					lineHeight: 'var(--ls-text-line)',
					letterSpacing: 'var(--ls-text-tracking)',
					fontWeight: 'var(--ls-text-weight)',
					color: 'var(--ls-text-secondary)',
				}}
			>
				{props.body}
			</div>
			{props.action ? (
				<button
					type="button"
					onClick={props.action.onClick}
					style={{
						marginTop: 'var(--spacer-2)',
						fontSize: 'var(--ls-text-size)',
						lineHeight: 'var(--ls-text-line)',
						letterSpacing: 'var(--ls-text-tracking)',
						fontWeight: 'var(--ls-text-weight-strong)',
						color: 'var(--ls-text-brand)',
						cursor: 'pointer',
					}}
				>
					{props.action.label}
				</button>
			) : null}
		</div>
	);
}
