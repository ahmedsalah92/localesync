import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { on, requestWithId, send } from '../bridge';
import { ExportModal } from '../export/ExportModal';
import { LABELS as EXPORT_LABELS } from '../export/copy';
import { ControlBar, SummaryBar } from '../shell/bands';
import { ChevronRightIcon } from '../shell/icons/ChevronRightIcon';
import { FooterStub } from '../shell/FooterStub';
import { ResultsList } from '../shell/ResultsList';
import { ResultsRow } from '../shell/ResultsRow';
import { StateView, type ShellState } from '../shell/StateView';
import { Button } from '../shell/primitives/Button';
import { Dropdown } from '../shell/primitives/Dropdown';
import { LABELS, SCANNING_START, SCOPES, STATES, rowMeta, scanningCount, summaryCount } from './copy';
import { driftedCount, extractReducer, initialExtractState, occurrenceCounts, type ExtractPhase } from './state';
import type { ErrorCode, ScanScope, SelectNode } from '../../common/messages';

/**
 * The Extract tab: every eligible text node in scope as a keyed row (LS-9).
 *
 * Owns its control bar, summary band, scroll region and Pro footer, like OverflowPanel (LS-8.2
 * §1.7). No language selector — extraction reads source strings (design.md), and no Stop —
 * interruption is safe and there is no cancel message (LS-9 §2.24).
 *
 * The `Export ▸` link is now present: LS-9 §2.35 deliberately omitted it rather than ship a control
 * that did nothing, and LS-6 restores it now that there is a surface to open (LS-6 §2.9.34).
 */
export function ExtractPanel() {
	const [state, dispatch] = useReducer(extractReducer, undefined, initialExtractState);
	const [exportOpen, setExportOpen] = useState(false);
	// The pass in flight — also the correlation id its progress ticks arrive under.
	const scanId = useRef<string | null>(null);
	// A jump is a separate exchange, kept apart so a `node-gone` cannot pass for a scan failure.
	const jumpId = useRef<string | null>(null);

	useEffect(() => {
		const offProgress = on('progress', (msg) => {
			// The dev harness streams its `ls9:` notes on `progress` under main-minted ids; the id filter
			// keeps them out of the count.
			if (msg.id !== scanId.current) return;
			dispatch({ kind: 'progress', completed: msg.completed, total: msg.total });
		});
		// Scan errors reject the request promise and never arrive here. This is for `select-node`, a
		// command with no pending entry.
		const offError = on('error', (msg) => {
			if (msg.id !== jumpId.current) return;
			dispatch({ kind: 'failed', code: msg.code });
		});
		return () => {
			offProgress();
			offError();
		};
	}, []);

	const onScan = useCallback(() => {
		const { id, response } = requestWithId('extraction-request', { scope: state.scope });
		scanId.current = id;
		dispatch({ kind: 'scan-started' });
		response.then(
			(result) => {
				if (scanId.current !== id) return;
				// `blocked` reaches state intact; rendering it waits on DES-2 copy.
				dispatch({ kind: 'result', entries: result.entries, blocked: result.blocked });
			},
			(err: unknown) => {
				if (scanId.current !== id) return;
				dispatch({ kind: 'failed', code: errorCodeOf(err) });
			},
		);
	}, [state.scope]);

	const onJump = useCallback((nodeId: string) => {
		jumpId.current = send<SelectNode>({ type: 'select-node', nodeId });
	}, []);

	const scanning = state.phase === 'scanning';
	const counts = occurrenceCounts(state.entries);
	const emptyState = resolveState(state.phase, state.errorCode, state.entries.length);
	// Hidden in every StateView state and throughout scanning; shown only with rows.
	const hasFooter = emptyState === null && !scanning;

	return (
		<>
			<ControlBar>
				<div style={{ width: 88, flexShrink: 0, display: 'flex' }}>
					<Dropdown
						label={LABELS.scope}
						value={state.scope}
						options={SCOPES}
						onChange={(scope) => dispatch({ kind: 'set-scope', scope: scope as ScanScope })}
						prefixLabel={false}
						fill
						disabled={scanning}
					/>
				</div>
				{/* Scope and Scan only, space-between (design.md: the Extract variant carries no language). */}
				<div style={{ flex: 1 }} />
				<Button variant="primary" onClick={onScan} disabled={scanning}>
					{LABELS.scan}
				</Button>
			</ControlBar>

			{renderSummary()}

			<ResultsList hasFooter={hasFooter}>
				{emptyState !== null
					? renderState(emptyState)
					: state.entries.map((entry) => (
							<ResultsRow
								key={entry.nodeId}
								tone="neutral"
								primary={entry.value}
								meta={rowMeta(entry, counts.get(entry.nodeId) ?? 1)}
								monoMeta
								selected={state.selectedNodeId === entry.nodeId}
								onSelect={() => dispatch({ kind: 'select', nodeId: entry.nodeId })}
								onJump={() => onJump(entry.nodeId)}
								jumpLabel={LABELS.jump}
							/>
						))}
			</ResultsList>

			{hasFooter ? <FooterStub name={LABELS.footer} /> : null}

			{exportOpen ? <ExportModal entries={state.entries} onClose={() => setExportOpen(false)} /> : null}
		</>
	);

	function renderSummary() {
		if (scanning) {
			const known = state.total > 0;
			return (
				<SummaryBar
					count={known ? scanningCount(state.completed, state.total) : SCANNING_START}
					tone="secondary"
					progress={known ? state.completed / state.total : 'indeterminate'}
				/>
			);
		}
		if (state.entries.length === 0) return null; // the empty shells show no summary
		return (
			<SummaryBar
				count={summaryCount(state.entries.length, driftedCount(state.entries))}
				controls={
					/* design.md, Composite labels: a label text plus an icon instance in a 2px wrapper,
					   so the chevron tokenises independently of the label. Both bind `text/brand` — the
					   chevron is part of the link, not neutral chrome. */
					<button
						type="button"
						onClick={() => setExportOpen(true)}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 2,
							padding: 0,
							border: 'none',
							background: 'none',
							cursor: 'pointer',
							color: 'var(--ls-text-brand)',
							fontSize: 'var(--ls-text-size)',
							lineHeight: 'var(--ls-text-line)',
							letterSpacing: 'var(--ls-text-tracking)',
							fontWeight: 'var(--ls-text-weight-strong)',
							whiteSpace: 'nowrap',
						}}
					>
						{EXPORT_LABELS.open}
						<ChevronRightIcon />
					</button>
				}
			/>
		);
	}

	function renderState(shellState: ShellState) {
		const retry = { label: LABELS.tryAgain, onClick: onScan };
		switch (shellState) {
			case 'no-selection':
				return <StateView state={shellState} {...STATES.noSelection} action={retry} />;
			case 'no-text-on-page':
				return <StateView state={shellState} {...STATES.noText} />;
			case 'operation-failed':
				return <StateView state={shellState} {...STATES.operationFailed} action={retry} />;
			default:
				// first-run, and every overflow-only state this panel never resolves to. `scan-stopped`
				// is N/A for Extract: there is no Stop (LS-9 §2.24).
				return <StateView state="first-run" {...STATES.firstRun} />;
		}
	}
}

/** The state matrix for Extract. Returns null when rows should render instead. */
function resolveState(phase: ExtractPhase, errorCode: ErrorCode | null, entryCount: number): ShellState | null {
	switch (phase) {
		case 'idle':
			return 'first-run';
		case 'failed':
			return errorCode === 'no-selection' ? 'no-selection' : 'operation-failed';
		case 'scanning':
			return null;
		case 'done':
			// Zero eligible nodes is a valid empty result, rendered as its own surface (rule 25).
			return entryCount === 0 ? 'no-text-on-page' : null;
	}
}

/** The bridge rejects a request with the whole `ErrorMessage`, but `catch` types it `unknown`. */
function errorCodeOf(err: unknown): ErrorCode {
	if (typeof err === 'object' && err !== null && 'code' in err) {
		const code = (err as { code: unknown }).code;
		if (typeof code === 'string') return code as ErrorCode;
	}
	return 'internal';
}
