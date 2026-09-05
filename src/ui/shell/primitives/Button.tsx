import type { ReactNode } from 'react';

/**
 * `primary` is the Scan trigger — `bg/brand` fill, `text/onbrand` label. `secondary` is Stop, which
 * takes the same slot mid-scan: a `bg/secondary` **fill** with a `text/default` label. Secondary
 * rather than danger, because stopping abandons work in progress without destroying anything.
 *
 * Both were code-vs-canvas defects until LS-8.2 §1.6: the radius read `--radius-medium` where
 * design.md binds `Radius/radius-small` to "Control Bar selects and the Scan button", and the
 * secondary variant was transparent-with-border rather than a fill.
 */
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
				borderRadius: 'var(--radius-small)',
				backgroundColor: isPrimary ? 'var(--ls-bg-brand)' : 'var(--ls-bg-secondary)',
				border: 'none',
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
