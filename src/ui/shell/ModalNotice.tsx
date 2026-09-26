import type { ReactNode } from 'react';

/**
 * A modal's danger or warning line — the Import modal's error, invalid-language and replace-confirm
 * lines, the Export modal's not-verbatim notices (LS-34). `aria-live="polite"` so a screen reader
 * hears a line that appears in answer to the user's action, without interrupting them.
 */
export function ModalNotice(props: { tone: 'danger' | 'warning'; children: ReactNode }) {
	return (
		<span
			aria-live="polite"
			style={{
				fontSize: 'var(--ls-text-size)',
				lineHeight: 'var(--ls-text-line)',
				letterSpacing: 'var(--ls-text-tracking)',
				color: props.tone === 'danger' ? 'var(--ls-text-danger)' : 'var(--ls-text-warning)',
			}}
		>
			{props.children}
		</span>
	);
}
