import type { ReactNode } from 'react';

/**
 * `hasFooter` drives the §2.2 scroll-clearance rule: with a footer, rows end at 680 and the
 * scrollbar clears the last row; without one, rows run to the window edge and need the 16px pad.
 */
export function ResultsList(props: { children: ReactNode; hasFooter: boolean }) {
	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				overflowY: 'auto',
				paddingBottom: props.hasFooter ? 0 : 'var(--spacer-3)',
			}}
		>
			{props.children}
		</div>
	);
}
