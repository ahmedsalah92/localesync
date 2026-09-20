import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ApplyRtlMirror, RevertRtlMirror, SelectNode } from '../../common/messages';
import type { BlockedNode, FlaggedNode } from '../../common/models';
import { on, send } from '../bridge';
import { ControlBar } from '../shell/bands';
import { ResultsList } from '../shell/ResultsList';
import { ResultsRow } from '../shell/ResultsRow';
import { StateView } from '../shell/StateView';
import { useApplied } from '../shell/applied';
import { Switch } from '../shell/primitives/Switch';
import { FLAG_REASON, LABELS, STATES, appliedMessage, fontsUnavailable } from './copy';
import {
	initialRtlState,
	isBusy,
	isMirrorOn,
	missingFontCount,
	progressAction,
	rtlReducer,
	selectShell,
	type PendingOp,
} from './state';

/**
 * The RTL tab: mirror the layout horizontally to surface right-to-left breakage, and revert it
 * byte-identically (LS-11).
 *
 * **One control, a Switch** — unlike pseudo-loc there is nothing to choose before committing, so
 * there is no separate Apply button: on applies, off reverts (§2.7). Scope is implicit and resolved
 * on the main thread, which is why the panel has no scope select (§2.10).
 *
 * The rows are the **review list**, not the mirrored nodes: a mirror that worked needs no row. They
 * are nodes the mirror moved but could not rotate, because the plugin never mirrors artwork (G1).
 */
export function RtlPanel() {
	const [state, dispatch] = useReducer(rtlReducer, undefined, initialRtlState);
	const { setApplied } = useApplied();
	// The command in flight — also the correlation id its progress/error arrive under.
	const runId = useRef<string | null>(null);
	// A jump is a separate exchange, kept apart so a `node-gone` cannot pass for a mirror failure.
	const jumpId = useRef<string | null>(null);

	// What we are waiting on, in a REF. The listener below is registered once and must not read
	// React state: a closure created before the toggle was clicked still holds the old phase.
	const pending = useRef<PendingOp>(null);
	// Accumulated by messages that arrive BEFORE the terminal progress, so the final dispatch has
	// them without the listener needing to re-subscribe when they change.
	const flagged = useRef<FlaggedNode[]>([]);
	const blocked = useRef<BlockedNode[]>([]);

	const onToggle = useCallback((checked: boolean) => {
		if (checked) {
			pending.current = 'apply';
			flagged.current = [];
			blocked.current = [];
			runId.current = send<ApplyRtlMirror>({ type: 'apply-rtl-mirror', scope: 'selection' });
			dispatch({ kind: 'apply-started' });
		} else {
			pending.current = 'revert';
			runId.current = send<RevertRtlMirror>({ type: 'revert-rtl-mirror' });
			dispatch({ kind: 'revert-started' });
		}
	}, []);

	// The banner's Revert is the same action as turning the Switch off.
	const onToggleRef = useRef(onToggle);
	onToggleRef.current = onToggle;
	const setAppliedRef = useRef(setApplied);
	setAppliedRef.current = setApplied;

	// Registered ONCE. Everything it reads is a ref, so there is nothing here that can go stale and
	// no dependency that can cause a re-subscribe mid-run.
	useEffect(() => {
		// Both messages are commands, so the outcome arrives as progress/error rather than a typed
		// response (LS-2). A terminal `progress` means done; `nodes-blocked` is a warning that
		// precedes it and must not be treated as a failure.
		const offFlagged = on('rtl-flagged', (msg) => {
			if (msg.id !== runId.current) return;
			flagged.current = msg.flagged;
			dispatch({ kind: 'flagged', flagged: msg.flagged });
		});
		const offProgress = on('progress', (msg) => {
			if (msg.id !== runId.current) return;
			const action = progressAction(pending.current, blocked.current);
			const wasApply = pending.current === 'apply';
			pending.current = null;
			if (action === null) return; // a progress we were not waiting on
			dispatch(action);
			setAppliedRef.current(
				wasApply
					? {
							kind: 'applied',
							message: appliedMessage(flagged.current.length),
							onRevert: () => {
								onToggleRef.current(false);
							},
						}
					: null,
			);
		});
		const offError = on('error', (msg) => {
			if (msg.id === jumpId.current) return; // a failed jump is not a mirror failure
			if (msg.id !== runId.current) return;
			// `nodes-blocked` precedes the terminal progress; hold it rather than finishing early.
			if (msg.severity === 'warning') {
				blocked.current = msg.blocked ?? [];
				return;
			}
			pending.current = null;
			// The panel renders one of a few fixed states, so the code and the main thread's own
			// message are lost at this point. In dev that is the difference between "it failed" and
			// knowing why — which is exactly what was missing when the toggle first misbehaved.
			if (import.meta.env.DEV) console.error(`[dev] rtl ${msg.code}: ${msg.message}`);
			dispatch({ kind: 'failed', code: msg.code });
			setAppliedRef.current(null);
		});
		return () => {
			offFlagged();
			offProgress();
			offError();
		};
	}, []);

	const onJump = useCallback((nodeId: string) => {
		jumpId.current = send<SelectNode>({ type: 'select-node', nodeId });
	}, []);

	const missingFonts = missingFontCount(state.blocked);
	const which = selectShell(state, missingFonts);
	const shell =
		which === null
			? null
			: which === 'operation-failed'
				? { state: which, ...STATES.operationFailed }
				: which === 'no-text-on-page'
					? { state: which, ...STATES.noText }
					: which === 'fonts-unavailable'
						? { state: which, ...fontsUnavailable(missingFonts) }
						: which === 'no-issues'
							? { state: which, ...STATES.nothingToReview }
							: { state: which, ...STATES.firstRun };

	return (
		<>
			<ControlBar>
				{/* `Switch` carries `label` as its aria-label only — it is composed into a labelled row
				    wherever it appears, and DES-2 specifies a LABELLED switch here. Same markup and the
				    same 8px gap as the Export modal's dedup toggle. */}
				<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-2)' }}>
					<Switch
						checked={isMirrorOn(state.phase)}
						onChange={onToggle}
						label={LABELS.mirror}
						disabled={isBusy(state.phase)}
					/>
					<span
						style={{
							fontSize: 'var(--ls-text-size)',
							lineHeight: 'var(--ls-text-line)',
							letterSpacing: 'var(--ls-text-tracking)',
							color: 'var(--ls-text-default)',
						}}
					>
						{LABELS.mirror}
					</span>
				</span>
			</ControlBar>

			{shell !== null ? (
				<StateView
					state={shell.state}
					headline={shell.headline}
					body={shell.body}
					action={
						state.phase === 'failed'
							? {
									label: LABELS.tryAgain,
									onClick: () => {
										onToggle(true);
									},
								}
							: undefined
					}
				/>
			) : (
				<ResultsList hasFooter={false}>
					{state.flagged.map((entry) => (
						<ResultsRow
							key={entry.nodeId}
							tone="truncates"
							primary={entry.name}
							meta={{ label: FLAG_REASON[entry.reason] }}
							selected={state.selectedNodeId === entry.nodeId}
							onSelect={() => {
								dispatch({ kind: 'select', nodeId: entry.nodeId });
							}}
							onJump={() => {
								onJump(entry.nodeId);
							}}
							jumpLabel={LABELS.jump}
						/>
					))}
				</ResultsList>
			)}
		</>
	);
}
