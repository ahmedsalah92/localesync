import { BAND_HEIGHT } from './geometry';

/**
 * The LS-13 Pro pillar's placeholder — it holds the footer band's shape until LS-13 fills it in.
 *
 * Its own module rather than a helper inside panels.tsx, because `panels.tsx` imports the real
 * `OverflowPanel` and `OverflowPanel` needs this footer: keeping it there would be an import cycle.
 *
 * The 40px wrapper used to live in Shell.tsx. It moved here when LS-8.2 §1.7 gave panels ownership
 * of everything below the tab bar — a panel with pinned bands cannot exist while the shell renders
 * it *inside* the scroll container, so the footer had to move with it.
 */
export function FooterStub(props: { name: string }) {
	return (
		<div
			style={{
				height: BAND_HEIGHT,
				flexShrink: 0,
				display: 'flex',
				alignItems: 'center',
				padding: `0 var(--spacer-3)`,
				fontSize: 'var(--ls-text-size)',
				lineHeight: 'var(--ls-text-line)',
				letterSpacing: 'var(--ls-text-tracking)',
				color: 'var(--ls-text-tertiary)',
			}}
		>
			{props.name}
		</div>
	);
}
