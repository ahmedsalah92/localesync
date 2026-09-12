import { useState } from 'react';
import type { ExtractedString } from '../../common/models';
import { CloseIcon } from '../shell/icons/CloseIcon';
import { Dropdown } from '../shell/primitives/Dropdown';
import { Switch } from '../shell/primitives/Switch';
import { FORMATS, LABELS, omittedNotice, remappedNotice } from './copy';
import { downloadExport, serialize } from './index';
import type { ExportFormat } from './types';

/**
 * The export sub-surface (LS-24 Deliverable 1) — a UI3 **Modal**, not a tab, sheet or popover.
 *
 * LS-24 closed the sheet-vs-popover question: UI3 ships no native primitive for a multi-control
 * form with a terminal action, and Modal (header/body/footer) is the only pattern in the kit with
 * full native coverage for that shape. Built at 400px to match the Extract panel it opens over,
 * not the UI3 template's 320px default.
 *
 * Geometry is transcribed from node 526:2258: header 40 · content 200 (16px padding, 16px gap) ·
 * footer 40. The two footer buttons are local rather than the shared `Button` primitive on purpose
 * — that primitive encodes control-bar geometry (radius-small, a *filled* secondary for Stop) and
 * the UI3 Modal footer is a different component: radius-medium, with a bordered Cancel. Reusing it
 * would have meant either a visibly wrong footer or bending a primitive three other panels depend
 * on.
 */
export function ExportModal(props: { entries: readonly ExtractedString[]; onClose: () => void }) {
	const [format, setFormat] = useState<ExportFormat>('json');
	const [dedup, setDedup] = useState(false);
	// Set by the last download, so the two rare not-verbatim outcomes are surfaced rather than
	// silently swallowed (§2.1.2, §2.2.13). Cleared whenever the options change.
	const [notices, setNotices] = useState<string[]>([]);

	function onDownload() {
		const result = serialize(props.entries, { format, dedup });
		downloadExport(result);
		const next: string[] = [];
		if (result.omitted.length > 0) next.push(omittedNotice(result.omitted.length));
		const remapped = result.keyMap.filter((entry) => entry.reason === 'android-remap-collision');
		if (remapped.length > 0) next.push(remappedNotice(remapped.length));
		setNotices(next);
	}

	return (
		<div
			style={{
				// Fixed, not absolute: the panel is a plain flex column with no positioned ancestor,
				// and the scrim must cover the whole plugin window. z-index 2 clears the dev harness's 1.
				position: 'fixed',
				inset: 0,
				zIndex: 2,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				// A scrim, so the modal reads as over the panel rather than as another band in it.
				backgroundColor: 'rgb(0 0 0 / 0.2)',
			}}
			onClick={props.onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={LABELS.title}
				// The overlay closes on click; the modal must not close when its own body is clicked.
				onClick={(event) => event.stopPropagation()}
				style={{
					width: 400,
					maxWidth: '100%',
					display: 'flex',
					flexDirection: 'column',
					backgroundColor: 'var(--ls-bg-default)',
					borderRadius: 'var(--radius-medium)',
					overflow: 'hidden',
				}}
			>
				{/* ── Modal header (526:2205) ─────────────────────────────────────────────── */}
				<div
					style={{
						height: 40,
						flexShrink: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: `0 var(--spacer-1) 0 var(--spacer-3)`,
						borderBottom: '1px solid var(--ls-border-default)',
					}}
				>
					<span
						style={{
							fontSize: 'var(--ls-text-size)',
							lineHeight: 'var(--ls-text-line)',
							letterSpacing: 'var(--ls-text-tracking)',
							fontWeight: 'var(--ls-text-weight-strong)',
							color: 'var(--ls-text-default)',
						}}
					>
						{LABELS.title}
					</span>
					<button
						type="button"
						onClick={props.onClose}
						aria-label={LABELS.close}
						style={{
							display: 'flex',
							alignItems: 'center',
							padding: 0,
							border: 'none',
							background: 'none',
							borderRadius: 'var(--radius-medium)',
							color: 'var(--ls-icon-secondary)',
							cursor: 'pointer',
						}}
					>
						<CloseIcon />
					</button>
				</div>

				{/* ── Content (526:2257) ──────────────────────────────────────────────────── */}
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--spacer-3)',
						padding: 'var(--spacer-3)',
					}}
				>
					{/* Modal body/Input (526:2216) — label, dropdown, support text */}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
						<span
							style={{
								fontSize: 'var(--ls-text-size)',
								lineHeight: 'var(--ls-text-line)',
								letterSpacing: 'var(--ls-text-tracking)',
								fontWeight: 'var(--ls-text-weight-strong)',
								color: 'var(--ls-text-default)',
							}}
						>
							{LABELS.format}
						</span>
						<Dropdown
							label={LABELS.format}
							value={format}
							options={FORMATS}
							onChange={(next) => {
								setFormat(next as ExportFormat);
								setNotices([]);
							}}
							prefixLabel={false}
							fill
						/>
						<span style={supportText}>{LABELS.formatSupport}</span>
					</div>

					{/* Dedup Toggle (588:24) — Menu row/Toggle composing the native Switch */}
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						<div
							style={{
								height: 24,
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--spacer-2)',
							}}
						>
							<Switch
								checked={dedup}
								label={LABELS.dedup}
								onChange={(next) => {
									setDedup(next);
									setNotices([]);
								}}
							/>
							<span
								style={{
									fontSize: 'var(--ls-text-size)',
									lineHeight: 'var(--ls-text-line)',
									letterSpacing: 'var(--ls-text-tracking)',
									color: 'var(--ls-text-default)',
								}}
							>
								{LABELS.dedup}
							</span>
						</div>
						{/* 40px inset aligns the description past the switch (32) plus its gap (8). */}
						<span style={{ ...supportText, paddingLeft: 40 }}>{LABELS.dedupSupport}</span>
					</div>

					{notices.length > 0 ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-1)' }}>
							{notices.map((notice) => (
								<span key={notice} style={{ ...supportText, color: 'var(--ls-text-warning)' }}>
									{notice}
								</span>
							))}
						</div>
					) : null}
				</div>

				{/* ── Modal footer (526:2242) ─────────────────────────────────────────────── */}
				<div
					style={{
						height: 40,
						flexShrink: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'flex-end',
						gap: 'var(--spacer-2)',
						padding: `0 var(--spacer-1)`,
						borderTop: '1px solid var(--ls-border-default)',
					}}
				>
					<button type="button" onClick={props.onClose} style={{ ...footerButton, ...cancelButton }}>
						{LABELS.cancel}
					</button>
					<button type="button" onClick={onDownload} style={{ ...footerButton, ...downloadButton }}>
						{LABELS.download}
					</button>
				</div>
			</div>
		</div>
	);
}

const supportText = {
	fontSize: 'var(--ls-text-size)',
	lineHeight: 'var(--ls-text-line)',
	letterSpacing: 'var(--ls-text-tracking)',
	color: 'var(--ls-text-secondary)',
} as const;

const footerButton = {
	height: 24,
	padding: `0 var(--spacer-2)`,
	borderRadius: 'var(--radius-medium)',
	fontSize: 'var(--ls-text-size)',
	lineHeight: 'var(--ls-text-line)',
	letterSpacing: 'var(--ls-text-tracking)',
	cursor: 'pointer',
	whiteSpace: 'nowrap',
} as const;

const cancelButton = {
	backgroundColor: 'transparent',
	border: '1px solid var(--ls-border-default)',
	color: 'var(--ls-text-default)',
} as const;

const downloadButton = {
	backgroundColor: 'var(--ls-bg-brand)',
	border: 'none',
	color: 'var(--ls-text-onbrand)',
	fontWeight: 'var(--ls-text-weight-strong)',
} as const;
