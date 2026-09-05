import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { on, request, requestWithId, send } from '../bridge';
import { ControlBar, SummaryBar } from '../shell/bands';
import { FooterStub } from '../shell/FooterStub';
import { ResultsList } from '../shell/ResultsList';
import { ResultsRow } from '../shell/ResultsRow';
import { StateView, type ShellState } from '../shell/StateView';
import { Button } from '../shell/primitives/Button';
import { Dropdown } from '../shell/primitives/Dropdown';
import {
	FILTERS,
	LABELS,
	LANGUAGES,
	SCOPES,
	SORTS,
	STATES,
	foundYield,
	rowMeta,
	scanningCount,
	stoppedCount,
	summaryCount,
} from './copy';
import { foundCount, initialOverflowState, overflowReducer, visibleVerdicts, type ScanPhase } from './state';
import type { ErrorCode, OverflowScanCancel, ScanScope, SelectNode } from '../../common/messages';
import type { OverflowFilter, OverflowSort } from '../../common/overflow';
import type { OverflowVerdict } from '../../common/models';

/** Advisory only, and it never blocks a scan — provisional until LS-15's time-budget benchmark
 *  replaces it. The in-flight state already handles unbounded files through determinate progress,
 *  a live count, streaming rows and Stop (LS-8.2 §2.7). */
const LARGE_FILE_NODES = 500;

export function OverflowPanel() {
	const [state, dispatch] = useReducer(overflowReducer, undefined, initialOverflowState);
	// Eligible node count for the pre-scan `large-file` advisory. `null` until known — the advisory
	// simply does not appear if the probe has not answered, which is correct for something that
	// never blocks a scan.
	const [nodeCount, setNodeCount] = useState<number | null>(null);
	// The scan in flight. Also the correlation id for its progress ticks, its streamed partials, and
	// the cancel that stops it — `requestWithId` exists so the panel can hold it (LS-8.2 §2.8).
	const scanId = useRef<string | null>(null);
	// A jump is a separate exchange with its own id. Kept apart from the scan id so a `node-gone`
	// error cannot be mistaken for a scan failure.
	const jumpId = useRef<string | null>(null);

	useEffect(() => {
		const offProgress = on('progress', (msg) => {
			// The dev harness streams its own `ls8:` notes on `progress` under main-minted ids; the
			// id filter is what keeps them out of the panel's count.
			if (msg.id !== scanId.current) return;
			dispatch({ kind: 'progress', completed: msg.completed, total: msg.total });
		});
		const offPartial = on('overflow-scan-partial', (msg) => {
			if (msg.id !== scanId.current) return;
			dispatch({ kind: 'partial', verdicts: msg.verdicts });
		});
		// Scan errors settle the request promise and never arrive here — since the LS-8.2 §1.4 fix,
		// an `error` carrying a pending request's id rejects it. This handler is for `select-node`,
		// which is a command and has no pending entry.
		const offError = on('error', (msg) => {
			if (msg.id !== jumpId.current) return;
			dispatch({ kind: 'failed', code: msg.code });
		});
		return () => {
			offProgress();
			offPartial();
			offError();
		};
	}, []);

	// The pre-scan node count behind the `large-file` advisory (LS-8.2 §2.7). It rides LS-3's
	// existing `scan-request` — a read-only traversal with no clones and no font loads, so it costs
	// a fraction of a measurement scan. There is no cheaper count available: `total` otherwise
	// arrives on the scan's own first progress tick, which is far too late for a *pre*-scan warning.
	// `cancelled` covers StrictMode's dev double-invoke and a scope change mid-probe.
	useEffect(() => {
		let cancelled = false;
		request('scan-request', { scope: state.scope }).then(
			(result) => {
				if (!cancelled) setNodeCount(result.nodes.length);
			},
			() => {
				// An empty selection rejects with `no-selection`. Not an error worth surfacing here —
				// the scan itself reports it, and an advisory that cannot be computed simply is not
				// shown.
				if (!cancelled) setNodeCount(null);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [state.scope]);

	const onScan = useCallback(() => {
		const { id, response } = requestWithId('overflow-scan-request', {
			scope: state.scope,
			// §3 carve-out: always a one-element array, never a scalar.
			targetLanguages: [state.language],
		});
		scanId.current = id;
		dispatch({ kind: 'scan-started' });
		response.then(
			(result) => {
				if (scanId.current !== id) return; // a newer scan has taken over
				dispatch({ kind: 'result', verdicts: result.verdicts, stopped: result.stopped === true });
			},
			(err: unknown) => {
				if (scanId.current !== id) return;
				dispatch({ kind: 'failed', code: errorCodeOf(err) });
			},
		);
	}, [state.scope, state.language]);

	// The panel does NOT change phase on send. It waits for the result to say `stopped`, because a
	// cancel racing a natural finish would otherwise assert a stop that did not happen.
	const onStop = useCallback(() => {
		if (scanId.current !== null) send<OverflowScanCancel>({ type: 'overflow-scan-cancel' }, scanId.current);
	}, []);

	const onJump = useCallback((nodeId: string) => {
		jumpId.current = send<SelectNode>({ type: 'select-node', nodeId });
	}, []);

	const scanning = state.phase === 'scanning';
	const rows = visibleVerdicts(state);
	const emptyState = resolveState(state.phase, state.verdicts, rows, nodeCount);
	// Hidden in every StateView state and throughout scanning; shown only in the working states.
	const hasFooter = emptyState === null && !scanning;

	return (
		<>
			<ControlBar>
				<Dropdown
					label={LABELS.language}
					value={state.language}
					options={LANGUAGES}
					onChange={(language) => dispatch({ kind: 'set-language', language })}
					prefixLabel={false}
					fill
					disabled={scanning}
				/>
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
				{scanning ? (
					// Same slot, secondary rather than danger: stopping abandons work in progress
					// without destroying anything (design.md, LS-8.2 §2.3).
					<Button variant="secondary" onClick={onStop}>
						{LABELS.stop}
					</Button>
				) : (
					<Button variant="primary" onClick={onScan}>
						{LABELS.scan}
					</Button>
				)}
			</ControlBar>

			{renderSummary()}

			<ResultsList hasFooter={hasFooter}>
				{emptyState !== null
					? renderState(emptyState)
					: rows.map((verdict) => (
							<ResultsRow
								key={`${verdict.nodeId}:${verdict.language}`}
								tone={verdict.verdict}
								primary={verdict.characters}
								meta={rowMeta(verdict)}
								selected={state.selectedNodeId === verdict.nodeId}
								onSelect={() => dispatch({ kind: 'select', nodeId: verdict.nodeId })}
								onJump={() => onJump(verdict.nodeId)}
								jumpLabel={LABELS.jump}
							/>
						))}
			</ResultsList>

			{hasFooter ? <FooterStub name={LABELS.footer} /> : null}
		</>
	);

	function renderSummary() {
		if (scanning) {
			// Show and Sort are removed mid-scan and replaced by the running yield; the determinate
			// bar rides the band's bottom edge (LS-8.2 §2.4).
			return (
				<SummaryBar
					count={scanningCount(state.completed, state.total)}
					tone="secondary"
					controls={<Yield count={foundCount(state)} />}
					progress={state.total > 0 ? state.completed / state.total : 0}
				/>
			);
		}
		if (state.verdicts.length === 0) return null; // nothing scanned yet — the canvas empty shells show no summary
		const count =
			state.phase === 'stopped'
				? stoppedCount(rows.length, state.verdicts.length)
				: summaryCount(rows.length, state.verdicts.length);
		return (
			<SummaryBar
				count={count}
				controls={
					<>
						<Dropdown
							label={LABELS.show}
							value={state.filter}
							options={FILTERS}
							onChange={(filter) => dispatch({ kind: 'set-filter', filter: filter as OverflowFilter })}
							stroke={false}
						/>
						<Dropdown
							label={LABELS.sort}
							value={state.sort}
							options={SORTS}
							onChange={(sort) => dispatch({ kind: 'set-sort', sort: sort as OverflowSort })}
							stroke={false}
						/>
					</>
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
				return <StateView state={shellState} {...STATES.noTextOnPage} />;
			case 'no-issues':
				return <StateView state={shellState} {...STATES.noIssues(state.verdicts.length)} />;
			case 'fonts-unavailable':
				return <StateView state={shellState} {...STATES.fontsUnavailable} />;
			case 'large-file':
				return <StateView state={shellState} {...STATES.largeFile} />;
			case 'scan-stopped':
				return <StateView state={shellState} {...STATES.scanStopped} action={retry} />;
			case 'operation-failed':
				return <StateView state={shellState} {...STATES.operationFailed} action={retry} />;
			case 'first-run':
				return <StateView state={shellState} {...STATES.firstRun} />;
		}
	}
}

function Yield(props: { count: number }) {
	return (
		<span
			style={{
				fontSize: 'var(--ls-text-size)',
				lineHeight: 'var(--ls-text-line)',
				letterSpacing: 'var(--ls-text-tracking)',
				fontWeight: 'var(--ls-text-weight-strong)',
				color: 'var(--ls-text-default)',
				whiteSpace: 'nowrap',
			}}
		>
			{foundYield(props.count)}
		</span>
	);
}

/**
 * The §2.7 state matrix, in priority order. Returns null when rows should render instead.
 *
 * A stop that produced rows is deliberately NOT an empty state: the user pressed Stop, they did not
 * discard work. The bar goes, the selects unlock, the button reverts — and the rows stay.
 *
 * Lives here rather than in state.ts because it returns a `ShellState`, which is a shell-owned UI
 * concept; state.ts must stay free of shell imports so its tests run without jsdom.
 */
function resolveState(
	phase: ScanPhase,
	verdicts: readonly OverflowVerdict[],
	rows: readonly OverflowVerdict[],
	nodeCount: number | null,
): ShellState | null {
	switch (phase) {
		case 'idle':
			// Pre-scan only, and it never blocks: the Scan button stays live underneath it.
			return nodeCount !== null && nodeCount >= LARGE_FILE_NODES ? 'large-file' : 'first-run';
		case 'failed':
			return 'operation-failed';
		case 'scanning':
			return null;
		case 'stopped':
			// A stop that produced rows is not an empty state.
			return verdicts.length === 0 ? 'scan-stopped' : null;
		case 'done':
			if (verdicts.length === 0) return 'no-text-on-page';
			// Every node was refused or unreadable — the fonts-unavailable surface is more useful
			// than "no issues", which would be false.
			if (verdicts.every((verdict) => verdict.reason === 'missing-font' || verdict.reason === 'mixed-font-missing'))
				return 'fonts-unavailable';
			if (rows.length === 0) return 'no-issues';
			return null;
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
