import { useRef, useState, type ChangeEvent } from 'react';
import type { PreviewMap } from '../../common/models';
import { CloseIcon } from '../shell/icons/CloseIcon';
import { ModalNotice } from '../shell/ModalNotice';
import { useModalFocus } from '../shell/useModalFocus';
import { IMPORT, replaceNotice } from './copy';
import { canonicalLocale } from './locale';
import { isParseError, parseCsvTranslations, parseJsonTranslations, type ParseError } from './parse';

/**
 * The import sub-surface (LS-12 §2.1, design 574:1411) — the Export modal's scaffolding verbatim
 * (scrim, `role="dialog"`, 40px header with the UI3 close icon, 16px body, 40px footer with a
 * bordered Cancel and a brand primary), with an import body.
 *
 * The format comes from the file extension, case-insensitively; any other extension keeps Import
 * disabled and turns the help line danger. A `.json` file needs a Language (D3 — a design addition,
 * §4); a `.csv` names its languages in its header. Parsing runs on Import, not on choose, so a
 * parse failure is reported where the user just acted.
 *
 * When an imported language is already stored, the first Import asks (§2.1.6) and the primary
 * reads Replace; Replace sends the maps parsed for that confirm. `error` is the panel's answer to
 * the send — `storage-failed` keeps the modal open with its copy (§2.1.7). `busy` holds the primary
 * disabled while the panel's import is in flight (LS-34).
 */
export function ImportModal(props: {
	languages: readonly string[];
	onClose: () => void;
	onImport: (maps: PreviewMap[]) => void;
	error: string | null;
	/** An import is in flight — sent, with no progress or error back yet. Import/Replace stays disabled. */
	busy?: boolean;
	/** Called when a new file is chosen, so the panel can clear its stale `error`. */
	onFileChange?: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [language, setLanguage] = useState('');
	const [parseError, setParseError] = useState<string | null>(null);
	const [confirmReplace, setConfirmReplace] = useState<string[] | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	// The maps the confirm is about, so Replace sends exactly what was confirmed.
	const pending = useRef<PreviewMap[] | null>(null);
	const focus = useModalFocus(props.onClose);

	const { kind, canonical, languageInvalid, enabled } = importReadiness(
		file?.name ?? null,
		language,
		props.busy ?? false,
	);
	const error = parseError ?? props.error;

	function onFileChange(event: ChangeEvent<HTMLInputElement>) {
		// A new file is a new import: the panel's error line was about the last one.
		props.onFileChange?.();
		setFile(event.target.files?.[0] ?? null);
		setLanguage('');
		setParseError(null);
		setConfirmReplace(null);
		pending.current = null;
		// Cleared so choosing the same file again (after editing it on disk) still fires a change.
		event.target.value = '';
	}

	async function onImportClick(): Promise<void> {
		if (file === null || !enabled) return;
		let text: string;
		try {
			text = await file.text();
		} catch {
			setParseError(IMPORT.unreadable);
			return;
		}
		const parsed: { maps: PreviewMap[] } | ParseError =
			kind === 'json'
				? (() => {
						const r = parseJsonTranslations(text);
						return isParseError(r) ? r : { maps: [{ language: canonical as string, entries: r.entries }] };
					})()
				: parseCsvTranslations(text);
		if (isParseError(parsed)) {
			setParseError(parsed.error);
			return;
		}
		const replacing = parsed.maps.map((m) => m.language).filter((l) => props.languages.includes(l));
		if (replacing.length > 0) {
			setConfirmReplace(replacing);
			pending.current = parsed.maps;
			return;
		}
		props.onImport(parsed.maps);
	}

	function onPrimary() {
		if (!enabled) return;
		if (confirmReplace !== null && pending.current !== null) {
			props.onImport(pending.current);
			return;
		}
		void onImportClick();
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
				ref={focus.ref}
				role="dialog"
				aria-modal="true"
				aria-label={IMPORT.title}
				onKeyDown={focus.onKeyDown}
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
				{/* ── Modal header ──────────────────────────────────────────────────────────── */}
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
					<span style={labelText}>{IMPORT.title}</span>
					<button
						type="button"
						onClick={props.onClose}
						aria-label={IMPORT.close}
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

				{/* ── Content ───────────────────────────────────────────────────────────────── */}
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--spacer-3)',
						padding: 'var(--spacer-3)',
					}}
				>
					{/* File — label, the chosen name, the picker trigger, the help line */}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
						<span style={labelText}>{IMPORT.file}</span>
						<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-2)' }}>
							<input
								type="text"
								readOnly
								aria-label={IMPORT.file}
								value={file?.name ?? IMPORT.noFile}
								style={{
									...textInput,
									flex: '1 1 auto',
									color: file === null ? 'var(--ls-text-tertiary)' : 'var(--ls-text-default)',
								}}
							/>
							<button
								type="button"
								onClick={() => inputRef.current?.click()}
								style={{ ...footerButton, ...cancelButton }}
							>
								{IMPORT.choose}
							</button>
							<input
								ref={inputRef}
								type="file"
								accept=".json,.csv"
								onChange={onFileChange}
								style={{ display: 'none' }}
							/>
						</div>
						<span
							style={{ ...supportText, ...(kind === 'other' ? { color: 'var(--ls-text-danger)' } : {}) }}
						>
							{IMPORT.help}
						</span>
					</div>

					{kind === 'json' ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
							<span style={labelText}>{IMPORT.language}</span>
							<input
								type="text"
								aria-label={IMPORT.language}
								aria-invalid={languageInvalid}
								placeholder={IMPORT.languagePlaceholder}
								value={language}
								onChange={(event) => {
									setLanguage(event.target.value);
									// A confirm or a parse error describes the import as it was; a new
									// language is a different import.
									setConfirmReplace(null);
									setParseError(null);
									pending.current = null;
								}}
								style={{ ...textInput, color: 'var(--ls-text-default)' }}
							/>
							{languageInvalid ? <ModalNotice tone="danger">{IMPORT.invalidLanguage}</ModalNotice> : null}
						</div>
					) : null}

					{error !== null ? <ModalNotice tone="danger">{error}</ModalNotice> : null}

					{confirmReplace !== null ? (
						<ModalNotice tone="warning">{replaceNotice(confirmReplace)}</ModalNotice>
					) : null}
				</div>

				{/* ── Modal footer ──────────────────────────────────────────────────────────── */}
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
						{IMPORT.cancel}
					</button>
					<button
						type="button"
						disabled={!enabled}
						onClick={onPrimary}
						style={{ ...footerButton, ...primaryButton, ...(enabled ? {} : disabledButton) }}
					>
						{confirmReplace !== null ? IMPORT.replace : IMPORT.import}
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * What the chosen file and Language field allow (pure, for tests): the format from the extension,
 * case-insensitively; a `.json` needs a valid Language, a `.csv` names its own. `enabled` is the
 * primary's state — never while an import is in flight.
 */
export function importReadiness(
	fileName: string | null,
	language: string,
	busy: boolean,
): { kind: 'json' | 'csv' | 'other' | null; canonical: string | null; languageInvalid: boolean; enabled: boolean } {
	const kind =
		fileName === null ? null : /\.json$/i.test(fileName) ? 'json' : /\.csv$/i.test(fileName) ? 'csv' : 'other';
	const canonical = kind === 'json' ? canonicalLocale(language) : null;
	const languageInvalid = kind === 'json' && language.trim() !== '' && canonical === null;
	const ready = kind === 'csv' || (kind === 'json' && canonical !== null);
	return { kind, canonical, languageInvalid, enabled: ready && !busy };
}

const labelText = {
	fontSize: 'var(--ls-text-size)',
	lineHeight: 'var(--ls-text-line)',
	letterSpacing: 'var(--ls-text-tracking)',
	fontWeight: 'var(--ls-text-weight-strong)',
	color: 'var(--ls-text-default)',
} as const;

const supportText = {
	fontSize: 'var(--ls-text-size)',
	lineHeight: 'var(--ls-text-line)',
	letterSpacing: 'var(--ls-text-tracking)',
	color: 'var(--ls-text-secondary)',
} as const;

// UI3 Text input: 24px, bg/secondary, radius-medium, no stroke at rest.
const textInput = {
	height: 24,
	minWidth: 0,
	boxSizing: 'border-box',
	padding: `0 var(--spacer-2)`,
	border: '1px solid transparent',
	borderRadius: 'var(--radius-medium)',
	backgroundColor: 'var(--ls-bg-secondary)',
	fontSize: 'var(--ls-text-size)',
	lineHeight: 'var(--ls-text-line)',
	letterSpacing: 'var(--ls-text-tracking)',
	fontWeight: 'var(--ls-text-weight)',
	outline: 'none',
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

const primaryButton = {
	backgroundColor: 'var(--ls-bg-brand)',
	border: 'none',
	color: 'var(--ls-text-onbrand)',
	fontWeight: 'var(--ls-text-weight-strong)',
} as const;

// UI3's disabled primary: the neutral fill with tertiary text, not a dimmed brand.
const disabledButton = {
	backgroundColor: 'var(--ls-bg-tertiary)',
	color: 'var(--ls-text-tertiary)',
	cursor: 'default',
} as const;
