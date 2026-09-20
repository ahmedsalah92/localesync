import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ApplyRtlMirror, RevertRtlMirror, SelectNode } from '../../common/messages';
import { on, send } from '../bridge';
import { ControlBar } from '../shell/bands';
import { ResultsList } from '../shell/ResultsList';
import { ResultsRow } from '../shell/ResultsRow';
import { StateView } from '../shell/StateView';
import { useApplied } from '../shell/applied';
import { Switch } from '../shell/primitives/Switch';
import { FLAG_REASON, LABELS, STATES, appliedMessage, fontsUnavailable } from './copy';
import { initialRtlState, isBusy, isMirrorOn, missingFontCount, rtlReducer, selectShell } from './state';

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

	const onToggle = useCallback((checked: boolean) => {
		if (checked) {
			runId.current = send<ApplyRtlMirror>({ type: 'apply-rtl-mirror', scope: 'selection' });
			dispatch({ kind: 'apply-started' });
		} else {
			runId.current = send<RevertRtlMirror>({ type: 'revert-rtl-mirror' });
			dispatch({ kind: 'revert-started' });
		}
	}, []);

	const applying = state.phase === 'applying';
	// The banner's Revert is registered once per run; a ref keeps the effect off `onToggle`'s
	// identity, so re-registering the listeners cannot drop an in-flight correlation id.
	const onToggleRef = useRef(onToggle);
	onToggleRef.current = onToggle;

	useEffect(() => {
		// Both messages are commands, so the outcome arrives as progress/error rather than a typed
		// response (LS-2). A terminal `progress` means done; `nodes-blocked` is a warning that
		// precedes it and must not be treated as a failure.
		const offFlagged = on('rtl-flagged', (msg) => {
			if (msg.id !== runId.current) return;
			dispatch({ kind: 'flagged', flagged: msg.flagged });
		});
		const offProgress = on('progress', (msg) => {
			if (msg.id !== runId.current) return;
			dispatch(applying ? { kind: 'applied', blocked: [] } : { kind: 'reverted' });
			// The banner owns Revert, so turning the Switch off and pressing Revert are one action.
			setApplied(
				applying
					? {
							kind: 'applied',
							message: appliedMessage(state.flagged.length),
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
			if (msg.severity === 'warning') {
				dispatch({ kind: 'applied', blocked: msg.blocked ?? [] });
				return;
			}
			dispatch({ kind: 'failed', code: msg.code });
			setApplied(null);
		});
		return () => {
			offFlagged();
			offProgress();
			offError();
		};
	}, [applying, setApplied, state.flagged.length]);

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
