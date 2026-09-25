// src/main/rtl/scope.ts — which part of the page an RTL mirror restructures. Pure: no `figma`.
import type { ScanScope } from '../../common/messages';

/**
 * Scope is explicit — a select defaulting to Page (`docs/rtl-mirroring-ruleset.md` §7.3) — so it is
 * honoured, never second-guessed. Selection with nothing selected mirrors NOTHING and says so
 * (`no-selection`), where it once fell back to the whole page: a mirror restructures layout, and
 * restructuring what the user explicitly scoped out defeats the reason scope is explicit (LS-33).
 *
 * Pseudo-loc keeps its own fallback: its panel has no scope select (LS-10 §2.5).
 */
export function resolveMirrorScope(intent: ScanScope, selectionCount: number): ScanScope | 'no-selection' {
	if (intent === 'page') return 'page';
	return selectionCount > 0 ? 'selection' : 'no-selection';
}
