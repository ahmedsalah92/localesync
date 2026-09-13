import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ApplyPseudoLoc, ErrorCode, RevertPseudoLoc, SelectNode } from '../../common/messages';
import type { AccentStyle, BoundaryMarker } from '../../common/models';
import { on, requestWithId, send } from '../bridge';
import { transform } from '../../common/pseudoloc';
import { ControlBar } from '../shell/bands';
import { ResultsList } from '../shell/ResultsList';
import { ResultsRow } from '../shell/ResultsRow';
import { StateView, type ShellState } from '../shell/StateView';
import { useApplied } from '../shell/applied';
import { Button } from '../shell/primitives/Button';
import { Dropdown } from '../shell/primitives/Dropdown';
import { ACCENTS, EXPANSIONS, LABELS, MARKERS, STATES, appliedMessage, fontsUnavailable } from './copy';
import {
	initialPseudoState,
	isBusy,
	missingFontCount,
	pseudoReducer,
	type PseudoState,
} from './state';

/**
 * The Pseudo-loc tab: apply a padded/accented/bracketed transform to the canvas and revert it
 * byte-identically (LS-10).
 *
 * Owns its control bar and scroll region, like ExtractPanel (LS-8.2 §1.7). **No summary bar and no
 * footer** — the canvas carries neither, and `panels.tsx` registers `pseudo` with no Pro stub,
 * which is LS-5 §2.2's principled absence rather than an omission.
 *
 * Apply is explicit and the three selects do not re-apply on change (§2.6): a live-apply model
 * would rewrite the user's file on every dropdown interaction, with no confirming moment for an
 * operation that mutates their document.
 */
export function PseudoPanel() {
	const [state, dispatch] = useReducer(pseudoReducer, undefined, initialPseudoState);
	const { setApplied } = useApplied();
	// The command in flight — also the correlation id its progress/error arrive under.
	const runId = useRef<string | null>(null);
	// A jump is a separate exchange, kept apart so a `node-gone` cannot pass for an apply failure.
	const jumpId = useRef<string | null>(null);

	const onRevert = useCallback(() => {
		const id = send<RevertPseudoLoc>({ type: 'revert-pseudoloc' });
		runId.current = id;
		dispatch({ kind: 'revert-started' });
	}, []);

	useEffect(() => {
		// Both messages are commands, so the outcome arrives as progress/error rather than a typed
		// response (LS-2). A terminal `progress` means done; `nodes-blocked` is a warning that
		// precedes it and must not be treated as a failure.
		const offProgress = on('progress', (msg) => {
			if (msg.id !== runId.current) return;
			dispatch({ kind: 'reverted' });
		});
		const offError = on('error', (msg) => {
			if (msg.id === jumpId.current) return; // a failed jump is not an apply failure
			if (msg.id !== runId.current) return;
			if (msg.severity === 'warning') return; // handled where the run is awaited
			dispatch({ kind: 'failed', code: msg.code });
			setApplied(null);
		});
		return () => {
			offProgress();
			offError();
		};
	}, [setApplied]);

	const onApply = useCallback(() => {
		dispatch({ kind: 'apply-started' });
		// Extraction runs FIRST, and the order is load-bearing: it returns the ORIGINAL strings, which
		// the rows transform locally for display. Run after the apply it would return the already
		// transformed text and the rows would show a double transform.
		//
		// It also stamps LS-9 keys, so a first apply on an unstamped file costs two undo steps rather
		// than one. Subsequent applies cost one — LS-9 §2.20's second scan writes nothing — and the
		// stamps are inert plugin data, so an undo that leaves them behind changes nothing on canvas.
		const extraction = requestWithId('extraction-request', { scope: 'selection' });
		extraction.response.then(
			(result) => {
				const id = send<ApplyPseudoLoc>({ type: 'apply-pseudoloc', scope: 'selection', options: state.options });
				runId.current = id;

				const blocked: typeof result.blocked = [];
				const offWarning = on('error', (msg) => {
					if (msg.id === id && msg.severity === 'warning' && msg.blocked) blocked.push(...msg.blocked);
				});
				const offDone = on('progress', (msg) => {
					if (msg.id !== id) return;
					offWarning();
					offDone();
					dispatch({ kind: 'applied', entries: result.entries, blocked });
					setApplied({
							kind: 'applied',
							message: appliedMessage(state.options.expansionPct, blocked.length),
							onRevert,
						});
				});
			},
			(err: unknown) => dispatch({ kind: 'failed', code: errorCodeOf(err) }),
		);
	}, [state.options, setApplied, onRevert]);

	const onJump = useCallback((nodeId: string) => {
		jumpId.current = send<SelectNode>({ type: 'select-node', nodeId });
	}, []);

	const busy = isBusy(state.phase);
	const emptyState = resolveState(state);

	return (
		<>
			<ControlBar>
				<div style={{ width: 76, flexShrink: 0, display: 'flex' }}>
					<Dropdown
						label={LABELS.expansion}
						ariaLabel={LABELS.expansion}
						value={String(state.options.expansionPct)}
						options={EXPANSIONS}
						onChange={(next) => dispatch({ kind: 'set-options', options: { expansionPct: Number(next) } })}
						prefixLabel={false}
						fill
						disabled={busy}
					/>
				</div>
				<div style={{ width: 128, flexShrink: 0, display: 'flex' }}>
					<Dropdown
						label={LABELS.accent}
						ariaLabel={LABELS.accent}
						value={state.options.accent}
						options={ACCENTS}
						onChange={(next) => dispatch({ kind: 'set-options', options: { accent: next as AccentStyle } })}
						prefixLabel={false}
						fill
						disabled={busy}
					/>
				</div>
				<div style={{ width: 72, flexShrink: 0, display: 'flex' }}>
					<Dropdown
						label={LABELS.markers}
						ariaLabel={LABELS.markers}
						value={state.options.markers}
						options={MARKERS}
						onChange={(next) =>
							dispatch({ kind: 'set-options', options: { markers: next as BoundaryMarker } })
						}
						prefixLabel={false}
						fill
						disabled={busy}
					/>
				</div>
				<div style={{ flex: 1 }} />
				<Button variant="primary" onClick={onApply} disabled={busy}>
					{LABELS.apply}
				</Button>
			</ControlBar>

			<ResultsList hasFooter={false}>
				{emptyState !== null
					? renderState(emptyState)
					: state.entries.map((entry) => (
							<ResultsRow
								key={entry.nodeId}
								tone="neutral"
								/* Transformed with what the CANVAS holds, not what the selects now show — the
								   two diverge as soon as the user changes an option without re-applying. */
								primary={transform(entry.value, state.appliedWith ?? state.options)}
								meta={{ label: entry.key }}
								monoMeta
								selected={state.selectedNodeId === entry.nodeId}
								onSelect={() => dispatch({ kind: 'select', nodeId: entry.nodeId })}
								onJump={() => onJump(entry.nodeId)}
								jumpLabel={LABELS.jump}
							/>
						))}
			</ResultsList>
		</>
	);

	function renderState(shellState: ShellState) {
		const retry = { label: LABELS.tryAgain, onClick: onApply };
		switch (shellState) {
			case 'no-text-on-page':
				return <StateView state={shellState} {...STATES.noText} />;
			case 'fonts-unavailable':
				return <StateView state={shellState} {...fontsUnavailable(missingFontCount(state.blocked))} />;
			case 'operation-failed':
				return <StateView state={shellState} {...STATES.operationFailed} action={retry} />;
			default:
				return <StateView state="first-run" {...STATES.firstRun} />;
		}
	}
}

/**
 * The state matrix for Pseudo-loc. Returns null when rows should render instead.
 *
 * `no-selection` is deliberately absent: scope is selection-preferred and downgrades to the page
 * main-side, so an empty selection is never an error here (§2.5). Every node being skipped resolves
 * to `fonts-unavailable` rather than a generic failure, because that is the outcome DES-2 wrote copy
 * for — the mutating panels skip and flag, where Overflow lists un-measurable nodes.
 */
function resolveState(state: PseudoState): ShellState | null {
	switch (state.phase) {
		case 'idle':
			return 'first-run';
		case 'applying':
		case 'reverting':
			return state.entries.length > 0 ? null : 'first-run';
		case 'failed':
			return state.errorCode === 'no-text-nodes' ? 'no-text-on-page' : 'operation-failed';
		case 'applied':
			if (state.entries.length > 0) return null;
			return missingFontCount(state.blocked) > 0 ? 'fonts-unavailable' : 'no-text-on-page';
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
