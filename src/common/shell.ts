/** Iframe dimensions used when no stored window size is available. */
export interface WindowSize {
	width: number;
	height: number;
}

/**
 * Figma always draws its own ~40px window title bar above the plugin iframe (`showUI` exposes no
 * option to suppress it) — so this height is the iframe's own content height, not the full
 * on-screen window. The canvas shells are drawn 400×720 total (chrome 40 + iframe 680); this
 * constant is the 680, per docs/design.md → "Shell framing convention" (canvas `435:1442`).
 */
export const SHELL_DEFAULT_SIZE = { width: 400, height: 680 } as const;

/**
 * Iframe units, chrome-subtracted — the on-screen minimum window is 340×480. Figma draws ~40px of
 * its own chrome above the iframe and `showUI` exposes no way to suppress it, so this is the
 * number `figma.ui.resize` receives. Same convention as SHELL_DEFAULT_SIZE.
 */
export const SHELL_MIN_SIZE = { width: 340, height: 440 } as const;

/**
 * Rounds each finite axis to an integer, then floors it at SHELL_MIN_SIZE. A non-finite axis falls
 * back to the corresponding SHELL_DEFAULT_SIZE axis. No maximum — Figma clamps to the viewport.
 */
export function clampWindowSize(size: WindowSize): WindowSize {
	const width = Number.isFinite(size.width) ? size.width : SHELL_DEFAULT_SIZE.width;
	const height = Number.isFinite(size.height) ? size.height : SHELL_DEFAULT_SIZE.height;
	return {
		width: Math.max(SHELL_MIN_SIZE.width, Math.round(width)),
		height: Math.max(SHELL_MIN_SIZE.height, Math.round(height)),
	};
}

/** Guard for clientStorage reads: an object with finite numeric width and height. Pure. */
export function isWindowSize(value: unknown): value is WindowSize {
	if (typeof value !== 'object' || value === null) return false;
	const size = value as Record<string, unknown>;
	return (
		typeof size.width === 'number' &&
		Number.isFinite(size.width) &&
		typeof size.height === 'number' &&
		Number.isFinite(size.height)
	);
}
