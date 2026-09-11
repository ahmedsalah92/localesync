// src/main/extract/resolve.ts — OWNED by LS-9. Pure: no `figma` global, no async, no bridge import.
//
// Ownership and key assignment for one extraction pass (LS-9 §2 rules 6–13), over plain data.
// Factored out of ./index for the same reason snapshot/plan.ts is: the rules are the part most
// likely to be subtly wrong, and as a pure function they are Vitest-coverable. What Vitest cannot
// prove — that a stamp actually persists, and how Figma copies it — stays with the §3.3 harness.
import { deriveKey, derivesFrom, uniqueKey, type KeyScheme } from './key';
import type { Stamp, StoredKey } from './persist';
import type { TextNodeModel } from '../traversal/model';

/** An in-scope node: resolved, possibly stamped, and returned. */
export type KeyInput = Pick<TextNodeModel, 'nodeId' | 'name' | 'ancestorFrameNames'> & {
	stored: StoredKey | null; // null = absent or unparseable (rule 13)
};

/** Any text node on the page — the claim context. Read, never written. */
export interface PageStamp {
	nodeId: string;
	stored: StoredKey | null;
}

export interface KeyResolution {
	nodeId: string;
	key: string;
	drifted: boolean;
	/** The stamp to write, or null when the node already owns its key (rule 9 — nothing to write). */
	write: Stamp | null;
}

export interface ResolveOptions {
	/** Date.now() for this pass — the `t` on every stamp it writes. A parameter so this stays pure. */
	now: number;
	/**
	 * Every text node on the page, in document order. Ownership and uniqueness are judged against
	 * this, whatever the scan scope: scope decides what is returned, not what is considered.
	 * Defaults to the inputs themselves — a page-scoped pass with nothing outside it.
	 */
	page?: readonly PageStamp[];
}

/**
 * The age of a claim that predates `t`. Adopting a legacy stamp writes this rather than `now`, which
 * would turn the oldest possible claim into the youngest; reading a legacy stamp treats its absent
 * `t` as this. Below every real Date.now(), so "legacy wins" is ordinary numeric comparison.
 */
const LEGACY_T = 0;

interface Claim {
	stored: StoredKey | null;
	order: number; // document order on the page — the last-resort tiebreak
}

function drifted(input: KeyInput, stored: StoredKey): boolean {
	// Re-derived under the stamp's OWN scheme: the question is whether the layer has been renamed or
	// moved since stamping, not whether a different scheme would name it differently.
	return !derivesFrom(stored.k, deriveKey(input, stored.s));
}

/**
 * Which of two owners of one key has the older claim — negative when `a` wins.
 *
 * Stamp time, not layer position: position is something users reorder idly, and it must not decide
 * which node keeps its translations. A stamp with no `t` predates the field, so it reads as `0` —
 * older than any real timestamp, and exactly the value an adopted legacy claim is re-stamped with,
 * so the two compare as equals. Document order only breaks a genuine tie. `t` comes from each
 * collaborator's own clock, so skew between machines can misorder near-simultaneous stamps — still a
 * better signal than layer order.
 */
function compareClaims(a: Claim & { stored: StoredKey }, b: Claim & { stored: StoredKey }): number {
	// Explicit `=== undefined`, never truthiness: `0` is a real value here (an adopted legacy claim).
	const at = a.stored.t === undefined ? LEGACY_T : a.stored.t;
	const bt = b.stored.t === undefined ? LEGACY_T : b.stored.t;
	return at !== bt ? at - bt : a.order - b.order;
}

/**
 * One resolution per input, in input (document) order. Out-of-scope page nodes shape the result
 * but never appear in it.
 *
 * Three passes, so every retained key is reserved before any derivation runs (rule 7):
 *   1. owners, page-wide — `stored.n === nodeId` keep their key verbatim (rule 9). Several owners of
 *      one key: the oldest claim wins (compareClaims); an in-scope loser falls through to pass 3
 *      exactly like a copy (rule 10);
 *   2. adopters, page-wide — a stamp whose owner is absent from the page, carried by exactly one node
 *      on the page, is adopted and re-stamped with that node's id (rule 11);
 *   3. in-scope everything else derives: unstamped (13), copies of an owner still on the page (10),
 *      ambiguous carriers (12) and owner-tiebreak losers, each suffixed against the reserved set (6).
 */
export function resolveKeys(inputs: readonly KeyInput[], scheme: KeyScheme, options: ResolveOptions): KeyResolution[] {
	const { now } = options;
	const inScope = new Map(inputs.map((input, i) => [input.nodeId, i]));

	// The claim context, in document order. In-scope inputs are part of the page; one missing from the
	// sweep (only possible if the two reads raced a deletion) is appended so it still counts.
	const claims = new Map<string, Claim>();
	for (const { nodeId, stored } of options.page ?? inputs) claims.set(nodeId, { stored, order: claims.size });
	for (const { nodeId, stored } of inputs) {
		const claim = claims.get(nodeId);
		if (claim === undefined) claims.set(nodeId, { stored, order: claims.size });
		else claim.stored = stored; // the in-scope read is authoritative for its own node
	}

	const reserved = new Set<string>();
	const resolved: (KeyResolution | undefined)[] = new Array<KeyResolution | undefined>(inputs.length);

	// 1. Owners. Every owned key is reserved, including keys owned only outside the scope — a key a
	// node outside the selection owns must never be minted for a node inside it.
	const owners = new Map<string, { nodeId: string; claim: Claim & { stored: StoredKey } }>();
	for (const [nodeId, claim] of claims) {
		const { stored } = claim;
		if (stored === null || stored.n !== nodeId) continue;
		const current = owners.get(stored.k);
		const candidate = { nodeId, claim: { ...claim, stored } };
		if (current === undefined || compareClaims(candidate.claim, current.claim) < 0) owners.set(stored.k, candidate);
	}
	for (const [key, { nodeId, claim }] of owners) {
		reserved.add(key);
		const i = inScope.get(nodeId);
		const input = i === undefined ? undefined : inputs[i];
		if (i === undefined || input === undefined) continue;
		resolved[i] = { nodeId, key, drifted: drifted(input, claim.stored), write: null };
	}

	// 2. Adopters. Carriers are counted page-wide: a copy outside the scope makes an in-scope carrier
	// ambiguous just as surely as one inside it.
	const carriers = new Map<string, number>();
	for (const [nodeId, { stored }] of claims) {
		if (stored === null || stored.n === nodeId || claims.has(stored.n)) continue;
		carriers.set(stored.n, (carriers.get(stored.n) ?? 0) + 1);
	}
	for (const [nodeId, { stored }] of claims) {
		if (stored === null || stored.n === nodeId || claims.has(stored.n)) continue;
		if (carriers.get(stored.n) !== 1 || reserved.has(stored.k)) continue;
		reserved.add(stored.k);
		const i = inScope.get(nodeId);
		const input = i === undefined ? undefined : inputs[i];
		if (i === undefined || input === undefined) continue; // reserved, but only a page scan may re-stamp it
		resolved[i] = {
			nodeId,
			key: stored.k,
			drifted: drifted(input, stored),
			// The claim continues, so its age does too. A pre-`t` stamp is the oldest possible claim and is
			// re-stamped as such (LEGACY_T), never as `now`.
			write: { k: stored.k, s: stored.s, n: nodeId, t: stored.t === undefined ? LEGACY_T : stored.t },
		};
	}

	// 3. Derive, in scope only.
	return inputs.map((input, i) => {
		const done = resolved[i];
		if (done !== undefined) return done;
		const key = uniqueKey(deriveKey(input, scheme), reserved);
		reserved.add(key);
		return { nodeId: input.nodeId, key, drifted: false, write: { k: key, s: scheme, n: input.nodeId, t: now } };
	});
}
