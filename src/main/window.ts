import { clampWindowSize, isWindowSize, SHELL_DEFAULT_SIZE, type WindowSize } from '../common/shell';
import { on } from './bridge';

export const WINDOW_SIZE_KEY = 'localesync:window-size:v1';

const PERSIST_DEBOUNCE_MS = 250;
let persistTimer: number | undefined;

/** Load a valid, clamped saved iframe size, or the default when storage is absent or unreadable. */
export async function loadWindowSize(): Promise<WindowSize> {
	try {
		const stored: unknown = await figma.clientStorage.getAsync(WINDOW_SIZE_KEY);
		return clampWindowSize(isWindowSize(stored) ? stored : SHELL_DEFAULT_SIZE);
	} catch {
		return clampWindowSize(SHELL_DEFAULT_SIZE);
	}
}

/** Register clamp → resize → trailing-debounced persistence for UI resize commands. */
export function registerWindow(): void {
	on('resize-window', (message) => {
		const size = clampWindowSize(message);
		figma.ui.resize(size.width, size.height);

		if (persistTimer !== undefined) clearTimeout(persistTimer);
		persistTimer = setTimeout(() => {
			persistTimer = undefined;
			void figma.clientStorage.setAsync(WINDOW_SIZE_KEY, size).catch((err: unknown) => {
				console.warn(`[window] size persistence failed: ${err instanceof Error ? err.message : String(err)}`);
			});
		}, PERSIST_DEBOUNCE_MS);
	});
}
