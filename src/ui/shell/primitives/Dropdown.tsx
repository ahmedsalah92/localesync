import { ChevronDownIcon } from '../icons/ChevronDownIcon';

/**
 * Renders as a native `<select>` so the open option list is OS-rendered — sidesteps needing to
 * style a custom popover (and the `bg/menu/default` token that has no live binding, see
 * docs/specs/LS-5.md §3.2). Only the closed/trigger chrome is styled.
 */
export function Dropdown(props: {
	label: string;
	value: string;
	options: readonly { value: string; label: string }[];
	onChange: (value: string) => void;
}) {
	return (
		<div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', height: 24 }}>
			<select
				aria-label={props.label}
				value={props.value}
				onChange={(e) => props.onChange(e.target.value)}
				style={{
					appearance: 'none',
					height: 24,
					padding: `0 var(--spacer-4) 0 var(--spacer-2)`,
					borderRadius: 'var(--radius-medium)',
					border: '1px solid var(--ls-border-default)',
					backgroundColor: 'var(--ls-bg-default)',
					color: 'var(--ls-text-default)',
					fontSize: 'var(--ls-text-size)',
					lineHeight: 'var(--ls-text-line)',
					letterSpacing: 'var(--ls-text-tracking)',
					fontWeight: 'var(--ls-text-weight)',
					cursor: 'pointer',
				}}
			>
				{props.options.map((option) => (
					<option key={option.value} value={option.value}>
						{`${props.label}: ${option.label}`}
					</option>
				))}
			</select>
			<span
				style={{
					position: 'absolute',
					right: 'var(--spacer-1)',
					top: '50%',
					transform: 'translateY(-50%)',
					pointerEvents: 'none',
					color: 'var(--ls-icon-secondary)',
					width: 16,
					height: 16,
				}}
			>
				<ChevronDownIcon />
			</span>
		</div>
	);
}
