// src/ui/rtl/state.ts
//
// The RTL Mirror panel's reducer (LS-11 §2).
//
// Pure and DOM-free, like pseudo/state.ts: it imports types from `common` and nothing else, and must
// never reach `./bridge` — that module assigns a `window` listener at module scope and this file's
// tests run under Vitest's plain Node environment.
import type { ErrorCode, ScanScope } from '../../common/messages';
import type { BlockReason, BlockedNode, FlaggedNode } from '../../common/models';

/**
 * There is no pre-apply row list, matching the built design: the canvas carries an
 * `RTL Mirror Applied` shell plus empty states and nothing in between.
 *
 * Unlike pseudo-loc there is no `applying` → options step, because there are no options — the whole
 * control is one Switch, so the phase IS the toggle's state (LS-11 §2.7).
 */
export type RtlPhase = 'idle' | 'applying' | 'applied' | 'reverting' | 'failed';

/** Every reason the snapshot gate can block `rtl-mirror` for (`src/main/snapshot/plan.ts`).
 *  `mixed-font-char-mutation` is char-writing only and never reaches this panel. */
export type SkippedReason = Exclude<BlockReason, 'mixed-font-char-mutation'>;

/** Ordered by how actionable the skip is: instances and fonts are fixable in the file (LS-28 §2.1). */
export const SKIPPED_ORDER: readonly SkippedReason[] = ['instance-locked', 'missing-font', 'already-mutated', 'empty'];

export type GroupKey = 'moved' | `skipped:${SkippedReason}`;

/** The group that needs a human starts open; report-only groups start closed (LS-28 §2.3). */
const DEFAULT_EXPANDED: readonly GroupKey[] = ['moved'];

/** One row of the change summary before copy is applied (LS-28 §1.4). */
export type SummaryGroup =
	| { kind: 'mirrored'; count: number }
	| { kind: 'moved'; key: 'moved'; nodes: FlaggedNode[] }
	| { kind: 'skipped'; key: GroupKey; reason: SkippedReason; nodes: BlockedNode[] };

export interface RtlState {
	phase: RtlPhase;
	/**
	 * Explicit, and defaulting to Page to match the built design (ruleset §7.3).
	 *
	 * A mirror restructures layout, so a user who cannot see what is about to be restructured has
	 * no way to scope the blast radius. The main thread still downgrades a `selection` intent with
	 * an empty selection to `page`, so the control states intent rather than guaranteeing it.
	 */
	scope: ScanScope;
	/** Nodes the mirror moved but could not rotate — the review list (G1). */
	flagged: FlaggedNode[];
	/** Skipped nodes from the last run — the `nodes-blocked` warning's payload. */
	blocked: BlockedNode[];
	/** Layers the last apply wrote to — `progress.completed`. 0 when not applied. */
	mirrored: number;
	/** Open summary groups. Reset to the default on every apply and revert. */
	expanded: GroupKey[];
	selectedNodeId: string | null;
	errorCode: ErrorCode | null;
}

export type RtlAction =
	| { kind: 'set-scope'; scope: ScanScope }
	| { kind: 'apply-started' }
	| { kind: 'flagged'; flagged: FlaggedNode[] }
	| { kind: 'applied'; blocked: BlockedNode[]; mirrored: number }
	| { kind: 'revert-started' }
	| { kind: 'reverted' }
	| { kind: 'failed'; code: ErrorCode }
	| { kind: 'select'; nodeId: string }
	| { kind: 'toggle-group'; key: GroupKey };

/** A factory rather than a frozen const, so each mount gets its own arrays. */
export function initialRtlState(): RtlState {
	return {
		phase: 'idle',
		scope: 'page',
		flagged: [],
		blocked: [],
		mirrored: 0,
		expanded: [...DEFAULT_EXPANDED],
		selectedNodeId: null,
		errorCode: null,
	};
}

export function rtlReducer(state: RtlState, action: RtlAction): RtlState {
	switch (action.kind) {
		// Changing scope never re-applies: this mutates the user's file, so the switch is the commit.
		case 'set-scope':
			return { ...state, scope: action.scope };

		case 'apply-started':
			return {
				...state,
				phase: 'applying',
				flagged: [],
				blocked: [],
				mirrored: 0,
				expanded: [...DEFAULT_EXPANDED],
				errorCode: null,
			};

		// `rtl-flagged` arrives BEFORE the terminal progress, so this lands while still `applying`
		// and must not itself move the phase on — otherwise a run with nothing to review and a run
		// with a review list would take different paths to `applied`.
		case 'flagged':
			return { ...state, flagged: [...action.flagged] };

		case 'applied':
			return { ...state, phase: 'applied', blocked: [...action.blocked], mirrored: action.mirrored };

		case 'revert-started':
			return { ...state, phase: 'reverting', errorCode: null };

		// Back to the first-run surface: with the canvas restored there is nothing to review.
		case 'reverted':
			return {
				...state,
				phase: 'idle',
				flagged: [],
				blocked: [],
				mirrored: 0,
				expanded: [...DEFAULT_EXPANDED],
				selectedNodeId: null,
			};

		case 'failed':
			return { ...state, phase: 'failed', errorCode: action.code, flagged: [] };

		case 'select':
			return { ...state, selectedNodeId: action.nodeId };

		case 'toggle-group':
			return {
				...state,
				expanded: state.expanded.includes(action.key)
					? state.expanded.filter((key) => key !== action.key)
					: [...state.expanded, action.key],
			};
	}
}

/** The phases in which a canvas mutation is in flight. */
export type BusyPhase = Extract<RtlPhase, 'applying' | 'reverting'>;

/** True while a canvas mutation is in flight — the toggle is disabled throughout. A type guard so
 *  the panel can key the busy band's copy by phase without a second decision of its own. */
export function isBusy(phase: RtlPhase): phase is BusyPhase {
	return phase === 'applying' || phase === 'reverting';
}

/** The Switch is on whenever the mirror is applied or being applied, so it never flickers back
 *  mid-run and never reads "off" over a mirrored canvas. */
export function isMirrorOn(phase: RtlPhase): boolean {
	return phase === 'applied' || phase === 'applying';
}

/**
 * The change summary (LS-28 §2.1): what the mirror did, what needs a check, what it skipped.
 *
 * Empty unless applied — before that the panel shows a StateView shell. The mirrored group is
 * always first and always present after an apply, even at 0: "0 layers mirrored" is true and is
 * the most useful thing to say about a run where everything was skipped.
 */
export function summarize(state: RtlState): SummaryGroup[] {
	if (state.phase !== 'applied') return [];
	const groups: SummaryGroup[] = [{ kind: 'mirrored', count: state.mirrored }];
	if (state.flagged.length > 0) groups.push({ kind: 'moved', key: 'moved', nodes: state.flagged });
	for (const reason of SKIPPED_ORDER) {
		const nodes = state.blocked.filter((entry) => entry.reason === reason);
		if (nodes.length > 0) groups.push({ kind: 'skipped', key: `skipped:${reason}`, reason, nodes });
	}
	return groups;
}

/** Which empty state the panel body should show, `'busy'` for the in-flight band, or `null` to
 * render the change summary.
 *
 * Extracted from the panel because it is decision logic, not markup — it shipped wrong once
 * (a successful mirror with nothing to review fell through to the first-run copy). Since LS-28 the
 * phase alone decides: an applied mirror always has a summary to show, so the `no-issues` and
 * `fonts-unavailable` shells are gone.
 *
 * `'busy'` is not a StateView shell: it renders the shared SummaryBar, indeterminate, and nothing
 * else (LS-30). It shipped wrong too — every in-flight phase fell through to `first-run`, so a large
 * apply read "Nothing to mirror yet" under a Switch that was on and disabled.
 */
export type RtlShell = 'busy' | 'operation-failed' | 'no-selection' | 'no-text-on-page' | 'first-run' | null;

export function selectShell(state: RtlState): RtlShell {
	// First, so a retry from `failed` or a re-apply from `idle` never shows the phase it left.
	if (isBusy(state.phase)) return 'busy';
	// "Nothing in scope to mirror" is not a failure, and saying "The mirror failed and your canvas
	// was restored" for it is alarming and untrue — nothing was attempted, so nothing was restored.
	if (state.phase === 'failed' && state.errorCode === 'no-text-nodes') return 'no-text-on-page';
	// Selection scope with nothing selected: nothing was attempted either, and the fix is the user's
	// to make — select something, or switch scope to Page (LS-33).
	if (state.phase === 'failed' && state.errorCode === 'no-selection') return 'no-selection';
	if (state.phase === 'failed') return 'operation-failed';
	if (state.phase === 'applied') return null;
	return 'first-run';
}

/**
 * Which operation a panel is waiting on. Held in a ref by the panel, never in React state.
 *
 * The panel used to read `phase === 'applying'` inside its message listener to decide whether an
 * arriving `progress` meant "applied" or "reverted". That listener is a CLOSURE, created on the
 * render before the toggle was clicked — so it still saw the old phase, and an apply's completion
 * was handled as a revert: the canvas mirrored while the switch snapped back off.
 *
 * A ref cannot go stale, and putting the decision here rather than in the component means a test
 * watches it. Same lesson as `selectShell`.
 */
export type PendingOp = 'apply' | 'revert' | null;

/** The action a terminal `progress` should produce, or `null` to ignore an unexpected one.
 *  `completed` is the progress's own count — on an apply, the layers mirrored (LS-28 §1.4). */
export function progressAction(
	pending: PendingOp,
	blocked: readonly BlockedNode[],
	completed: number,
): RtlAction | null {
	if (pending === 'apply') return { kind: 'applied', blocked: [...blocked], mirrored: completed };
	if (pending === 'revert') return { kind: 'reverted' };
	return null;
}
