import type { ReactNode } from 'react';
import { BAND_HEIGHT } from './geometry';
import { ProgressBar } from './primitives/ProgressBar';

/**
 * The two horizontal bands a results panel pins above its scroll region, per docs/specs/LS-5.md
 * §1.5 and LS-8.2 §1.5.
 *
 * The file was declared by LS-5 but shipped empty: it also held the shell's own Plugin Header band,
 * which was deleted during visual QA because it duplicated Figma's non-suppressible window chrome,
 * and these two went with it as collateral. The header stays deleted and canvas-only (LS-5 §5.7);
 * neither of these duplicates anything Figma provides.
 *
 * Both are `BAND_HEIGHT` with a bottom `border/default` divider and a 16px horizontal inset, per
 * the 40px band rhythm agent-guidelines §7 makes a rule ("a band that hugs is a defect").
 */

const band = {
	height: BAND_HEIGHT,
	flexShrink: 0,
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--spacer-2)',
	padding: `0 var(--spacer-3)`,
	borderBottom: '1px solid var(--ls-border-default)',
} as const;

/** Scan inputs: the language and scope selects and the Scan/Stop trigger. */
export function ControlBar(props: { children: ReactNode }) {
	return <div style={band}>{props.children}</div>;
}

/**
 * Count on the left, controls on the right, with the determinate progress bar riding the band's
 * bottom edge — the existing divider is the bar's track, so it costs no vertical space.
 *
 * `count` is a `string` and the band owns its typography, selecting it from `tone`. LS-5 §1.5 had
 * it as a bare `ReactNode`, which would have made every caller restate the type ramp.
 */
export function SummaryBar(props: {
	count: string;
	/** `secondary` is the in-flight treatment; `default` is a settled, populated scan. */
	tone?: 'default' | 'secondary';
	/** The Show/Sort cluster, or the `N found` running yield while scanning. Right-aligned. */
	controls?: ReactNode;
	/** 0–1. Renders the 2px bar on the band's bottom edge; null or absent renders none. */
	progress?: number | null;
}) {
	const tone = props.tone ?? 'default';
	return (
		<div style={{ ...band, position: 'relative' }}>
			<span
				style={{
					flex: '1 1 auto',
					minWidth: 0,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					fontSize: 'var(--ls-text-size)',
					lineHeight: 'var(--ls-text-line)',
					letterSpacing: 'var(--ls-text-tracking)',
					fontWeight: tone === 'default' ? 'var(--ls-text-weight-strong)' : 'var(--ls-text-weight)',
					color: tone === 'default' ? 'var(--ls-text-default)' : 'var(--ls-text-secondary)',
				}}
			>
				{props.count}
			</span>
			{props.controls !== undefined ? (
				<span style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-2)', flexShrink: 0 }}>
					{props.controls}
				</span>
			) : null}
			{props.progress !== undefined && props.progress !== null ? (
				<span style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
					<ProgressBar value={props.progress} />
				</span>
			) : null}
		</div>
	);
}
