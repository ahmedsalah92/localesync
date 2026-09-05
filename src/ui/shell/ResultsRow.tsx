import { useState } from 'react';
import type { OverflowVerdictValue } from '../../common/models';
import { ArrowIcon } from './icons/ArrowIcon';
import { Tooltip } from './primitives/Tooltip';

export type RowTone = OverflowVerdictValue | 'neutral';

/**
 * The row's second line, as two independently-laid-out parts rather than one prepared string.
 *
 * `label` is the container path and is the only part allowed to truncate; `verdict` carries the
 * status word and the pixel delta (`•  overflows 30px`), which the Linear issue requires every
 * flagged row to state. Assembly lives with the copy (overflow/copy.ts `rowMeta`), not here.
 */
export interface RowMeta {
	label: string;
	verdict: string;
}

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
	meta: RowMeta;
	monoMeta?: boolean;
	selected: boolean;
	onSelect: () => void;
	onJump: () => void;
	jumpLabel: string;
}) {
	const tokens = toneToken(props.tone);
	const [jumpHover, setJumpHover] = useState(false);

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
			{/* Strip at x=0, full row height, per the Results Row component set (184:96). The row
			    carries no inset of its own — the 16px content inset below is the whole of it. */}
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
					{/* Two flex siblings, not one string. Concatenated, a deep container path ate the
					    whole line and took the verdict and the delta with it — observed live as
					    `Section — Plugin Header / Figma host chrome — not p…`, no verdict, no px. The
					    label yields; the verdict never does (LS-8.2 §2.6). */}
					<div
						style={{
							display: 'flex',
							alignItems: 'baseline',
							gap: 'var(--spacer-1)',
							minWidth: 0,
							fontSize: 'var(--ls-text-size)',
							letterSpacing: props.monoMeta ? undefined : 'var(--ls-text-tracking)',
							lineHeight: props.monoMeta ? 'var(--ls-mono-line)' : 'var(--ls-text-line)',
							fontFamily: props.monoMeta ? 'var(--ls-mono-family)' : undefined,
							fontWeight: props.monoMeta ? undefined : 'var(--ls-text-weight)',
							color: `var(${tokens.meta})`,
						}}
					>
						<span
							style={{
								flex: '1 1 auto',
								minWidth: 0,
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}
						>
							{props.meta.label}
						</span>
						<span style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>{props.meta.verdict}</span>
					</div>
				</div>
				<Tooltip label={props.jumpLabel}>
					{/* Glyph stays at the UI3 16×16 spec — verified against 293:1298, whose `Icon` is a
					    10×10 shape at (3,3), so the export is faithful and is not scaled up. The *hit
					    area* is 24×24 instead, pulled back with a negative margin so the row's layout is
					    unchanged, and hover lifts the icon out of `icon/secondary`. */}
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							props.onJump();
						}}
						onMouseEnter={() => setJumpHover(true)}
						onMouseLeave={() => setJumpHover(false)}
						onFocus={() => setJumpHover(true)}
						onBlur={() => setJumpHover(false)}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 24,
							height: 24,
							margin: -4,
							borderRadius: 'var(--radius-small)',
							backgroundColor: jumpHover ? 'var(--ls-bg-hover)' : 'transparent',
							color: jumpHover ? 'var(--ls-icon-default)' : 'var(--ls-icon-secondary)',
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
