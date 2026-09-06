import { SHELL_DEFAULT_SIZE } from '../../common/shell';

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

/** Iframe height minus the tab bar, minus the Applied Banner when present. */
export function contentAreaHeight(hasBanner: boolean, iframeHeight: number = SHELL_DEFAULT_SIZE.height): number {
	return iframeHeight - BAND_HEIGHT - (hasBanner ? BAND_HEIGHT : 0);
}

/**
 * Rows height: Content Area minus Control Bar, Summary Bar, and (if present) Footer — compressed
 * further by one band when the Applied Banner is present.
 */
export function rowsHeight(
	hasFooter: boolean,
	hasBanner: boolean,
	iframeHeight: number = SHELL_DEFAULT_SIZE.height,
): number {
	const content = contentAreaHeight(hasBanner, iframeHeight);
	const footer = hasFooter ? BAND_HEIGHT : 0;
	return content - BAND_HEIGHT * 2 - footer;
}
