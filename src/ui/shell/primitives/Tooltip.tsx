import { useState, type ReactNode } from 'react';

/**
 * Mirrors the UI3 Tooltip set (unpublished, cannot be instanced — docs/agent-guidelines.md §7),
 * but binds rather than hardcodes: `--ls-bg-tooltip` / `--ls-text-tooltip` stand in for the
 * canvas's literal fill/text (docs/specs/LS-5.md §2.5, §3.2). Radius, padding and type reuse the
 * existing `--radius-medium` / `--spacer-1` / `--spacer-2` / `--ls-text-*` tokens — every one of
 * those happens to match the canvas values exactly, so no new token was needed for them.
 */
export function Tooltip(props: { label: string; children: ReactNode }) {
	const [visible, setVisible] = useState(false);

	return (
		<span
			style={{ position: 'relative', display: 'inline-flex' }}
			onMouseEnter={() => setVisible(true)}
			onMouseLeave={() => setVisible(false)}
			onFocus={() => setVisible(true)}
			onBlur={() => setVisible(false)}
		>
			{props.children}
			{visible ? (
				<span
					role="tooltip"
					style={{
						position: 'absolute',
						right: '100%',
						top: '50%',
						transform: 'translateY(-50%)',
						marginRight: 'var(--spacer-2)',
						padding: `var(--spacer-1) var(--spacer-2)`,
						borderRadius: 'var(--radius-medium)',
						backgroundColor: 'var(--ls-bg-tooltip)',
						color: 'var(--ls-text-tooltip)',
						fontSize: 'var(--ls-text-size)',
						lineHeight: 'var(--ls-text-line)',
						letterSpacing: 'var(--ls-text-tracking)',
						fontWeight: 'var(--ls-text-weight)',
						boxShadow: 'var(--ls-tooltip-shadow)',
						whiteSpace: 'nowrap',
						pointerEvents: 'none',
					}}
				>
					{props.label}
				</span>
			) : null}
		</span>
	);
}
