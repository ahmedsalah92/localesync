/**
 * Band geometry for the shell, per docs/specs/LS-5.md §2.1. The canvas shells are drawn 400×720,
 * but the top 40px of that is Figma's own window chrome (not a band the plugin renders) — the
 * plugin iframe itself is the lower 680, confirmed by the canvas annotation "Shell framing
 * convention" (`435:1442`) and matched by `SHELL_DEFAULT_SIZE` (`src/common/shell.ts`).
 *
 * History: the shell originally rendered its own header band duplicating Figma's chrome (two
 * product names, two close buttons). Removed from code 2026-09-04 during LS-5 visual QA; the band
 * survives on canvas only as context, not as a component in this codebase (spec §5.7).
 */

/** Every horizontal band (tab bar, control bar, summary bar, banner, footer) is 40px. */
export const BAND_HEIGHT = 40;

/** Content Area height: full when no banner is present, compressed by one band when it is. */
export const CONTENT_AREA = {
	full: 640,
	withBanner: 600,
} as const;

/**
 * Rows height: Content Area minus Control Bar, Summary Bar, and (if present) Footer — compressed
 * further by one band when the Applied Banner is present.
 */
export function rowsHeight(hasFooter: boolean, hasBanner: boolean): number {
	const content = hasBanner ? CONTENT_AREA.withBanner : CONTENT_AREA.full;
	const footer = hasFooter ? BAND_HEIGHT : 0;
	return content - BAND_HEIGHT * 2 - footer;
}
