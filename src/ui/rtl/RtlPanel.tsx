import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ApplyRtlMirror, RevertRtlMirror, ScanScope, SelectNode } from '../../common/messages';
import type { BlockedNode, FlaggedNode } from '../../common/models';
import { on, send } from '../bridge';
import { ControlBar, SummaryBar } from '../shell/bands';
import { ProStub } from '../shell/ProStub';
import { ResultsList } from '../shell/ResultsList';
import { ResultsRow } from '../shell/ResultsRow';
import { StateView } from '../shell/StateView';
import { useApplied } from '../shell/applied';
import { Dropdown } from '../shell/primitives/Dropdown';
import { Switch } from '../shell/primitives/Switch';
import { BUSY, LABELS, SCOPES, STATES, appliedMessage } from './copy';
import { summaryRows } from './rows';
import {
	initialRtlState,
	isBusy,
	isMirrorOn,
	progressAction,
	rtlReducer,
	selectShell,
	summarize,
	type PendingOp,
} from './state';

/**
 * The RTL tab: mirror the layout horizontally to surface right-to-left breakage, and revert it
 * byte-identically (LS-11).
 *
 * **One control, a Switch** — unlike pseudo-loc there is nothing to choose before committing, so
 * there is no separate Apply button: on applies, off reverts (§2.7). Scope is explicit — the scope
 * select beside the Switch, defaulting to Page (`docs/rtl-mirroring-ruleset.md` §7.3) — and is
 * locked while the mirror is on, so it always describes the operation on the canvas.
 *
 * The rows are a **change summary** (LS-28): how many layers were mirrored, which icons moved and
 * need a direction check, and what was skipped and why. Groups expand to jumpable rows.
 */
export function RtlPanel() {
	const [state, dispatch] = useReducer(rtlReducer, undefined, initialRtlState);
	const { setApplied } = useApplied('rtl');
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

	// Read at send time rather than closed over, for the same reason the listener uses refs.
	const scopeRef = useRef<ScanScope>(state.scope);
	scopeRef.current = state.scope;

	const onToggle = useCallback((checked: boolean) => {
		if (checked) {
			pending.current = 'apply';
			flagged.current = [];
			blocked.current = [];
			runId.current = send<ApplyRtlMirror>({ type: 'apply-rtl-mirror', scope: scopeRef.current });
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
			const action = progressAction(pending.current, blocked.current, msg.completed);
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

	const which = selectShell(state);
	const shell =
		which === null || which === 'busy'
			? null
			: which === 'operation-failed'
				? { state: which, ...STATES.operationFailed }
				: which === 'no-selection'
					? { state: which, ...STATES.noSelection }
					: which === 'no-text-on-page'
						? { state: which, ...STATES.noText }
						: { state: which, ...STATES.firstRun };
	const rows = summaryRows(summarize(state), state.expanded);

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
				<div style={{ flex: 1 }} />
				{/* The scope select the built design carries (186:296 → Dropdown 538:1437), and the same
				    shared pattern Extract uses. Disabled mid-run: changing scope under an in-flight
				    mutation would describe a different operation from the one being performed. */}
				<div style={{ width: 88, flexShrink: 0, display: 'flex' }}>
					<Dropdown
						label={LABELS.scope}
						value={state.scope}
						options={SCOPES}
						onChange={(scope) => {
							dispatch({ kind: 'set-scope', scope: scope as ScanScope });
						}}
						prefixLabel={false}
						fill
						disabled={isBusy(state.phase) || isMirrorOn(state.phase)}
					/>
				</div>
			</ControlBar>

			{/* In flight, the body is the shared band alone — the treatment Overflow uses while scanning,
			    indeterminate because the mirror reports no intermediate progress (LS-30). */}
			{which === 'busy' && isBusy(state.phase) ? (
				<SummaryBar count={BUSY[state.phase]} tone="secondary" progress="indeterminate" />
			) : shell !== null ? (
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
				<ResultsList hasFooter>
					{rows.map((row) => {
						const trailing = row.trailing;
						const shared = {
							tone: row.tone,
							primary: row.primary,
							meta: { label: row.meta },
							depth: row.depth,
						};
						switch (trailing.kind) {
							case 'jump':
								return (
									<ResultsRow
										key={row.id}
										{...shared}
										selected={state.selectedNodeId === trailing.nodeId}
										onSelect={() => {
											dispatch({ kind: 'select', nodeId: trailing.nodeId });
										}}
										onJump={() => {
											onJump(trailing.nodeId);
										}}
										jumpLabel={LABELS.jump}
									/>
								);
							case 'expand':
								return (
									<ResultsRow
										key={row.id}
										{...shared}
										selected={false}
										expanded={trailing.expanded}
										onSelect={() => {
											dispatch({ kind: 'toggle-group', key: trailing.key });
										}}
									/>
								);
							case 'none':
								return <ResultsRow key={row.id} {...shared} selected={false} onSelect={() => {}} />;
						}
					})}
				</ResultsList>
			)}
			{/* LS-13: the Sync pillar's waitlist stub, in every state (canvas 351:1411). */}
			<ProStub pillar="sync" />
		</>
	);
}
