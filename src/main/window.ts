import { clampWindowSize, isWindowSize, SHELL_DEFAULT_SIZE, type WindowSize } from '../common/shell';
import { on } from './bridge';

export const WINDOW_SIZE_KEY = 'localesync:window-size:v1';

const PERSIST_DEBOUNCE_MS = 250;
let persistTimer: number | undefined;

interface DevResizeState {
	lastGestureId: string | null;
	gestureMessageCount: number;
	messagesSincePersist: number;
	lastAppliedSize: WindowSize | null;
}

type DevStateHost = typeof loadWindowSize & { __ls21DevState?: DevResizeState };

/** Load a valid, clamped saved iframe size, or the default when storage is absent or unreadable. */
export async function loadWindowSize(): Promise<WindowSize> {
	if (import.meta.env.DEV) {
		(loadWindowSize as DevStateHost).__ls21DevState = {
			lastGestureId: null,
			gestureMessageCount: 0,
			messagesSincePersist: 0,
			lastAppliedSize: null,
		};
	}
	try {
		const stored: unknown = await figma.clientStorage.getAsync(WINDOW_SIZE_KEY);
		if (import.meta.env.DEV) {
			const state = (loadWindowSize as DevStateHost).__ls21DevState!;
			if (stored === undefined) {
				console.log('[ls21] launch | no stored value, using default 400x680');
			} else if (isWindowSize(stored)) {
				console.log(`[ls21] launch | stored ${stored.width}x${stored.height}`);
			} else {
				console.log('[ls21] launch | invalid stored value, using default 400x680');
			}
			state.lastAppliedSize = clampWindowSize(isWindowSize(stored) ? stored : SHELL_DEFAULT_SIZE);
		}
		return clampWindowSize(isWindowSize(stored) ? stored : SHELL_DEFAULT_SIZE);
	} catch {
		if (import.meta.env.DEV) {
			const state = (loadWindowSize as DevStateHost).__ls21DevState!;
			console.log('[ls21] launch | storage read failed, using default 400x680');
			state.lastAppliedSize = clampWindowSize(SHELL_DEFAULT_SIZE);
		}
		return clampWindowSize(SHELL_DEFAULT_SIZE);
	}
}

/** Register clamp → resize → trailing-debounced persistence for UI resize commands. */
export function registerWindow(): void {
	on('resize-window', (message) => {
		const size = clampWindowSize(message);
		if (import.meta.env.DEV) {
			const stateHost = loadWindowSize as DevStateHost;
			const state = (stateHost.__ls21DevState ??= {
				lastGestureId: null,
				gestureMessageCount: 0,
				messagesSincePersist: 0,
				lastAppliedSize: null,
			});
			const before = state.lastAppliedSize ?? SHELL_DEFAULT_SIZE;
			state.messagesSincePersist += 1;
			if (message.id !== state.lastGestureId) {
				state.lastGestureId = message.id;
				state.gestureMessageCount = 1;
				console.log(
					`[ls21] gesture ${message.id} start | before ${before.width}x${before.height} | first msg ${message.width}x${message.height} | delta ${message.width - before.width}x${message.height - before.height}`,
				);
			} else {
				state.gestureMessageCount += 1;
				if (state.gestureMessageCount % 10 === 0) {
					console.log(
						`[ls21] gesture ${message.id} #${state.gestureMessageCount} | requested ${message.width}x${message.height} | clamped ${size.width}x${size.height}`,
					);
				}
			}
		}
		figma.ui.resize(size.width, size.height);
		if (import.meta.env.DEV) {
			(loadWindowSize as DevStateHost).__ls21DevState!.lastAppliedSize = size;
		}

		if (persistTimer !== undefined) clearTimeout(persistTimer);
		persistTimer = setTimeout(() => {
			persistTimer = undefined;
			if (import.meta.env.DEV) {
				const state = (loadWindowSize as DevStateHost).__ls21DevState!;
				console.log(
					`[ls21] persist fired after ${state.messagesSincePersist} message(s) -> ${size.width}x${size.height}`,
				);
				state.messagesSincePersist = 0;
			}
			void figma.clientStorage.setAsync(WINDOW_SIZE_KEY, size).catch((err: unknown) => {
				console.warn(`[window] size persistence failed: ${err instanceof Error ? err.message : String(err)}`);
			});
		}, PERSIST_DEBOUNCE_MS);
	});
}
