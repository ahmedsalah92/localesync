import type { ReactNode } from 'react';
import type { OverflowVerdictValue } from '../../common/models';
import { ArrowIcon } from './icons/ArrowIcon';
import { Tooltip } from './primitives/Tooltip';

export type RowTone = OverflowVerdictValue | 'neutral';

/**
 * The severity-ramp tokens for a row, per docs/specs/LS-5.md §2.4. Exhaustive switch, no
 * `default` — adding a `RowTone` member without a case here fails `npx tsc -b`.
 */
export function toneToken(tone: RowTone): { strip: string; meta: string } {
	switch (tone) {
		case 'fits':
			return { strip: '--ls-icon-success', meta: '--ls-text-secondary' };
		case 'truncates':
			return { strip: '--ls-icon-warning', meta: '--ls-text-warning' };
		case 'overflows':
			return { strip: '--ls-icon-danger', meta: '--ls-text-danger' };
		case 'unmeasurable':
			return { strip: '--ls-icon-tertiary', meta: '--ls-text-tertiary' };
		case 'neutral':
			return { strip: '--ls-border-neutral', meta: '--ls-text-tertiary' };
	}
}

export function ResultsRow(props: {
	tone: RowTone;
	primary: string;
	meta: ReactNode;
	monoMeta?: boolean;
	selected: boolean;
	onSelect: () => void;
	onJump: () => void;
	jumpLabel: string;
}) {
	const tokens = toneToken(props.tone);

	return (
		<div
			onClick={props.onSelect}
			style={{
				display: 'flex',
				height: 56,
				backgroundColor: props.selected ? 'var(--ls-bg-selected)' : 'transparent',
				cursor: 'pointer',
			}}
		>
			<div style={{ width: 3, flexShrink: 0, backgroundColor: `var(${tokens.strip})` }} />
			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--spacer-2)',
					padding: `var(--spacer-2) var(--spacer-3)`,
				}}
			>
				<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-1)' }}>
					<div
						style={{
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
							fontSize: 'var(--ls-text-size)',
							lineHeight: 'var(--ls-text-line)',
							letterSpacing: 'var(--ls-text-tracking)',
							fontWeight: 'var(--ls-text-weight)',
							color: 'var(--ls-text-default)',
						}}
					>
						{props.primary}
					</div>
					<div
						style={{
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
							fontSize: 'var(--ls-text-size)',
							letterSpacing: props.monoMeta ? undefined : 'var(--ls-text-tracking)',
							lineHeight: props.monoMeta ? 'var(--ls-mono-line)' : 'var(--ls-text-line)',
							fontFamily: props.monoMeta ? 'var(--ls-mono-family)' : undefined,
							fontWeight: props.monoMeta ? undefined : 'var(--ls-text-weight)',
							color: `var(${tokens.meta})`,
						}}
					>
						{props.meta}
					</div>
				</div>
				<Tooltip label={props.jumpLabel}>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							props.onJump();
						}}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 16,
							height: 16,
							color: 'var(--ls-icon-secondary)',
							flexShrink: 0,
						}}
					>
						<ArrowIcon />
					</button>
				</Tooltip>
			</div>
		</div>
	);
}
