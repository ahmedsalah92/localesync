import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { ApplyPreview, PreviewEdit, PreviewImport, RevertPreview, SelectNode } from '../../common/messages';
import type { BlockedNode, PreviewMap } from '../../common/models';
import { on, request, send } from '../bridge';
import { ControlBar, SummaryBar } from '../shell/bands';
import { FooterStub } from '../shell/FooterStub';
import { ChevronRightIcon } from '../shell/icons/ChevronRightIcon';
import { ResultsList } from '../shell/ResultsList';
import { ResultsRow } from '../shell/ResultsRow';
import { StateView } from '../shell/StateView';
import { useApplied } from '../shell/applied';
import { Dropdown } from '../shell/primitives/Dropdown';
import { IMPORT, LABELS, STATES, appliedMessage, busyLabel, summaryCount } from './copy';
import { ImportModal } from './ImportModal';
import { languageLabel } from './locale';
import { previewRows } from './rows';
import {
	commitDecision,
	initialPreviewState,
	isBusy,
	onCommandError,
	previewReducer,
	reapplyAfterImport,
	selectShell,
	translatedCount,
	type PendingOp,
} from './state';

/**
 * The Preview tab: apply an imported language to the page in place, edit it inline, revert it
 * (LS-12). Structured like RtlPanel: one listener registered once, reading only refs, and every
 * decision in the pure `state.ts` / `rows.ts` — this component only wires them to the bridge.
 *
 * Picking a language applies it (no Apply button, §2.2); the applied banner's Revert reverts it.
 * "Import ▸" in the summary bar opens the Import modal (§2.1). The footer is the Translate Pro stub
 * (LS-13 scope), always shown, as the stub it replaces was.
 */
export function PreviewPanel() {
	const [state, dispatch] = useReducer(previewReducer, undefined, initialPreviewState);
	const [importing, setImporting] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const { setApplied } = useApplied();
	// The command in flight — also the correlation id its result/progress/error arrive under.
	const runId = useRef<string | null>(null);
	// A jump is a separate exchange, kept apart so a `node-gone` cannot pass for a preview failure.
	const jumpId = useRef<string | null>(null);
	const pending = useRef<PendingOp>(null);
	// Accumulated from the `nodes-blocked` warning that precedes the terminal progress.
	const blocked = useRef<BlockedNode[]>([]);
	const languageRef = useRef<string | null>(null);
	// The languages the in-flight import carries, for the re-apply decision on its progress.
	const importedLanguages = useRef<string[]>([]);
	// The latest rendered state, for everything that runs outside a render: the listener, and the
	// editor's blur/Enter handlers (see `commitEdit`).
	const stateRef = useRef(state);
	stateRef.current = state;
	const setAppliedRef = useRef(setApplied);
	setAppliedRef.current = setApplied;

	// `fatal` only for the mount load and its retry: a failed refresh after an import must not
	// replace a live preview with "Couldn't complete … your canvas was restored".
	const refreshLanguages = useCallback((fatal = false) => {
		request('preview-state-request', {}).then(
			(msg) => dispatch({ kind: 'languages', languages: msg.languages }),
			(err: unknown) => {
				if (import.meta.env.DEV) console.error('[dev] preview-state-request failed', err);
				if (fatal) dispatch({ kind: 'failed', code: 'internal' });
			},
		);
	}, []);

	const apply = useCallback((language: string) => {
		pending.current = 'apply';
		blocked.current = [];
		languageRef.current = language;
		runId.current = send<ApplyPreview>({ type: 'apply-preview', language });
		dispatch({ kind: 'apply-started', language });
	}, []);

	const revert = useCallback(() => {
		pending.current = 'revert';
		runId.current = send<RevertPreview>({ type: 'revert-preview' });
		dispatch({ kind: 'revert-started' });
	}, []);
	const revertRef = useRef(revert);
	revertRef.current = revert;

	// Registered ONCE. Everything it reads is a ref or a stable callback.
	useEffect(() => {
		refreshLanguages(true);
		const offResult = on('preview-result', (msg) => {
			if (msg.id !== runId.current) return;
			dispatch({ kind: 'result', language: msg.language, rows: msg.rows, unmatched: msg.unmatched });
		});
		const offProgress = on('progress', (msg) => {
			if (msg.id !== runId.current) return;
			const op = pending.current;
			pending.current = null;
			if (op === 'import') {
				setImporting(false);
				refreshLanguages();
				// The main thread only saves (ruling I4); a replaced language that is on the canvas
				// right now is re-applied here, so the canvas never shows stale values (§2.1.7).
				const again = reapplyAfterImport(stateRef.current, importedLanguages.current);
				if (again !== null) apply(again);
				return;
			}
			if (op === 'revert') {
				languageRef.current = null;
				dispatch({ kind: 'reverted' });
				setAppliedRef.current(null);
				return;
			}
			if (op === 'apply' || op === 'edit') {
				dispatch({ kind: 'applied', blocked: blocked.current });
				const language = languageRef.current;
				if (language !== null)
					setAppliedRef.current({
						kind: 'applied',
						message: appliedMessage(language),
						onRevert: () => revertRef.current(),
					});
			}
		});
		const offError = on('error', (msg) => {
			if (msg.id === jumpId.current) return; // a failed jump is not a preview failure
			if (msg.id !== runId.current) return;
			// `nodes-blocked` precedes the terminal progress; hold it rather than finishing early.
			if (msg.severity === 'warning') {
				blocked.current = msg.blocked ?? [];
				return;
			}
			const op = pending.current;
			pending.current = null;
			if (import.meta.env.DEV) console.error(`[dev] preview ${msg.code}: ${msg.message}`);
			const outcome = onCommandError(op, msg.code);
			if (outcome === 'import-failed') {
				// The modal stays open with the reason; nothing changed (§2.1.7).
				setImportError(msg.code === 'storage-failed' ? IMPORT.storageFailed : msg.message);
				return;
			}
			if (outcome === 'revert-failed') {
				// The preview is still on the canvas: stay applied, keep the banner — its Revert retries.
				dispatch({ kind: 'revert-failed' });
				return;
			}
			const language = languageRef.current;
			if (outcome === 'reapply' && language !== null) {
				// A failed edit may leave other layers translated. Re-applying restores first, then
				// applies; the banner stays until that apply's own progress or error settles it.
				apply(language);
				return;
			}
			dispatch({ kind: 'failed', code: msg.code });
			// A failed edit save changes nothing, so the preview — and its banner — are still there.
			if (msg.code !== 'storage-failed') setAppliedRef.current(null);
		});
		return () => {
			offResult();
			offProgress();
			offError();
		};
	}, [refreshLanguages, apply]);

	const onImport = useCallback((maps: PreviewMap[]) => {
		setImportError(null);
		pending.current = 'import';
		importedLanguages.current = maps.map((m) => m.language);
		runId.current = send<PreviewImport>({ type: 'preview-import', maps });
	}, []);

	// Reads `stateRef`, never a closed-over `state`: the editor's onBlur/onKeyDown and a row's onEdit
	// may hold a callback from an earlier render, and a stale one would commit an old draft. Stable
	// identity, so nothing re-subscribes. The `editing === null` return makes a second call — a blur
	// racing the Enter that already committed — a no-op rather than a second send.
	const commitEdit = useCallback(() => {
		const s = stateRef.current;
		if (s.editing === null) return;
		const decision = commitDecision(s);
		const language = s.language;
		if (decision === null || language === null) {
			dispatch({ kind: 'edit-cancel' });
			return;
		}
		pending.current = 'edit';
		blocked.current = [];
		runId.current = send<PreviewEdit>({ type: 'preview-edit', language, key: decision.key, value: decision.value });
		dispatch({ kind: 'edit-sent' });
	}, []);

	// One editor at a time: starting a second commits the first (D6). Starting the open one again —
	// a double-click inside its own field — is nothing.
	const startEdit = useCallback(
		(nodeId: string, value: string) => {
			const open = stateRef.current.editing;
			if (open !== null && open.nodeId === nodeId) return;
			if (open !== null) commitEdit();
			dispatch({ kind: 'edit-start', nodeId, value });
		},
		[commitEdit],
	);

	const onJump = useCallback((nodeId: string) => {
		jumpId.current = send<SelectNode>({ type: 'select-node', nodeId });
	}, []);

	const shell = selectShell(state);
	const busy = isBusy(state.phase);
	const rows = previewRows(state);
	const languageOptions = [
		{ value: '', label: LABELS.chooseLanguage },
		...state.languages.map((code) => ({ value: code, label: languageLabel(code) })),
	];

	return (
		<>
			{state.languages.length > 0 ? (
				<ControlBar>
					<Dropdown
						label={LABELS.language}
						prefixLabel={false}
						ariaLabel={LABELS.language}
						value={state.language ?? ''}
						options={languageOptions}
						disabled={busy}
						fill
						onChange={(value) => {
							if (value !== '' && value !== state.language) apply(value);
						}}
					/>
				</ControlBar>
			) : null}

			<SummaryBar
				count={
					busy
						? busyLabel(state)
						: state.phase === 'applied'
							? summaryCount(translatedCount(state.rows), state.rows.length)
							: ''
				}
				tone={busy ? 'secondary' : 'default'}
				progress={busy ? 'indeterminate' : null}
				controls={
					/* Extract's "Export ▸" markup: a label plus an icon instance in a 2px wrapper, both
					   `text/brand` — the chevron is part of the link, not neutral chrome. */
					<button
						type="button"
						onClick={() => setImporting(true)}
						disabled={busy}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 2,
							padding: 0,
							border: 'none',
							background: 'none',
							cursor: busy ? 'default' : 'pointer',
							color: busy ? 'var(--ls-text-tertiary)' : 'var(--ls-text-brand)',
							fontSize: 'var(--ls-text-size)',
							lineHeight: 'var(--ls-text-line)',
							letterSpacing: 'var(--ls-text-tracking)',
							fontWeight: 'var(--ls-text-weight-strong)',
							whiteSpace: 'nowrap',
						}}
					>
						{LABELS.import}
						<ChevronRightIcon />
					</button>
				}
			/>

			<ResultsList hasFooter>
				{shell === 'busy' ? null : shell !== null ? renderState() : renderRows()}
			</ResultsList>

			<FooterStub name="Translate" />

			{importing ? (
				<ImportModal
					languages={state.languages}
					error={importError}
					onClose={() => {
						setImporting(false);
						setImportError(null);
					}}
					onImport={onImport}
				/>
			) : null}
		</>
	);

	function renderState(): ReactNode {
		const retry = () => {
			if (state.language !== null) apply(state.language);
			else refreshLanguages(true);
		};
		switch (shell) {
			case 'no-languages':
				return (
					<StateView
						state="first-run"
						{...STATES.noLanguages}
						action={{ label: LABELS.import, onClick: () => setImporting(true) }}
					/>
				);
			case 'no-keys':
				return <StateView state="first-run" {...STATES.noKeys} />;
			case 'no-text-on-page':
				return <StateView state="first-run" {...STATES.noText} />;
			case 'choose-language':
				return <StateView state="first-run" {...STATES.chooseLanguage} />;
			case 'operation-failed':
				return (
					<StateView
						state="operation-failed"
						{...STATES.operationFailed}
						action={{ label: LABELS.tryAgain, onClick: retry }}
					/>
				);
			case 'storage-failed':
				return (
					<StateView
						state="operation-failed"
						{...STATES.storageFailed}
						action={{ label: LABELS.tryAgain, onClick: retry }}
					/>
				);
			default:
				return null;
		}
	}

	function renderRows(): ReactNode {
		return rows.map((model) => {
			switch (model.kind) {
				case 'string':
					return (
						<ResultsRow
							key={model.id}
							tone={model.tone}
							primary={model.primary}
							meta={{ label: model.key, verdict: model.verdict }}
							monoMeta
							selected={state.selectedNodeId === model.nodeId}
							onSelect={() => dispatch({ kind: 'select', nodeId: model.nodeId })}
							onJump={() => onJump(model.nodeId)}
							jumpLabel={LABELS.jump}
							onEdit={() => startEdit(model.nodeId, model.primary)}
							editor={model.editing ? renderEditor(model.key) : undefined}
						/>
					);
				case 'group':
					return (
						<ResultsRow
							key={model.id}
							tone="unmeasurable"
							primary={model.primary}
							meta={{ label: model.meta }}
							selected={false}
							expanded={model.expanded}
							onSelect={() => dispatch({ kind: 'toggle-group', key: model.id })}
						/>
					);
				case 'child': {
					const nodeId = model.nodeId;
					const shared = {
						depth: 1 as const,
						tone: 'unmeasurable' as const,
						primary: model.primary,
						meta: { label: model.meta },
						selected: false,
						onSelect: () => {},
					};
					return nodeId === null ? (
						<ResultsRow key={model.id} {...shared} />
					) : (
						<ResultsRow key={model.id} {...shared} onJump={() => onJump(nodeId)} jumpLabel={LABELS.jump} />
					);
				}
			}
		});
	}

	function renderEditor(key: string): ReactNode {
		return (
			<input
				type="text"
				autoFocus
				aria-label={key}
				value={state.editing?.draft ?? ''}
				onChange={(e) => dispatch({ kind: 'edit-change', draft: e.target.value })}
				onBlur={commitEdit}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						commitEdit();
					} else if (e.key === 'Escape') {
						e.preventDefault();
						dispatch({ kind: 'edit-cancel' });
					}
				}}
				onFocus={(e) => e.currentTarget.select()}
				// A double-click selects a word in the field; it must not reach the row and restart the edit.
				onDoubleClick={(e) => e.stopPropagation()}
				style={{
					height: 24,
					width: '100%',
					minWidth: 0,
					boxSizing: 'border-box',
					padding: `0 var(--spacer-2)`,
					backgroundColor: 'var(--ls-bg-secondary)',
					border: '1px solid var(--ls-border-selected)',
					borderRadius: 'var(--radius-medium)',
					outline: 'none',
					fontSize: 'var(--ls-text-size)',
					lineHeight: 'var(--ls-text-line)',
					letterSpacing: 'var(--ls-text-tracking)',
					fontWeight: 'var(--ls-text-weight)',
					color: 'var(--ls-text-default)',
				}}
			/>
		);
	}
}
