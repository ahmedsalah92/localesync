import type { ReactNode } from 'react';

export function Button(props: {
	variant: 'primary' | 'secondary';
	children: ReactNode;
	onClick: () => void;
	disabled?: boolean;
}) {
	const isPrimary = props.variant === 'primary';
	return (
		<button
			type="button"
			onClick={props.onClick}
			disabled={props.disabled}
			style={{
				height: 24,
				padding: `0 var(--spacer-2)`,
				borderRadius: 'var(--radius-medium)',
				backgroundColor: isPrimary ? 'var(--ls-bg-brand)' : 'transparent',
				border: isPrimary ? 'none' : '1px solid var(--ls-border-default)',
				color: isPrimary ? 'var(--ls-text-onbrand)' : 'var(--ls-text-default)',
				fontSize: 'var(--ls-text-size)',
				lineHeight: 'var(--ls-text-line)',
				letterSpacing: 'var(--ls-text-tracking)',
				fontWeight: 'var(--ls-text-weight-strong)',
				cursor: props.disabled ? 'default' : 'pointer',
				opacity: props.disabled ? 0.4 : 1,
				whiteSpace: 'nowrap',
			}}
		>
			{props.children}
		</button>
	);
}
