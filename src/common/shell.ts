/**
 * Figma always draws its own ~40px window title bar above the plugin iframe (`showUI` exposes no
 * option to suppress it) — so this height is the iframe's own content height, not the full
 * on-screen window. The canvas shells are drawn 400×720 total (chrome 40 + iframe 680); this
 * constant is the 680, per docs/design.md → "Shell framing convention" (canvas `435:1442`).
 */
export const SHELL_DEFAULT_SIZE = { width: 400, height: 680 } as const;
