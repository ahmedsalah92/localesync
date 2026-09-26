// src/ui/pseudo/watchApply.ts — one Pseudo-loc apply's own listeners (LS-34).
//
// Pure of the bridge: the panel passes its `on` in, so the tests drive a fake. Never import
// ../bridge here — it claims a `window` listener at module scope.
import type { ErrorMessage, ProgressMessage } from '../../common/messages';
import type { BlockedNode } from '../../common/models';

export interface ApplySubscribe {
	onError: (handler: (msg: ErrorMessage) => void) => () => void;
	onProgress: (handler: (msg: ProgressMessage) => void) => () => void;
}

/**
 * Watches the apply sent under `id`: collects its `nodes-blocked` warnings, and on its terminal
 * `progress` unsubscribes and calls `onDone` with them. A hard error for `id` also unsubscribes —
 * a failed apply sends no terminal progress, so the listeners used to stay registered forever. The
 * failure itself is still the panel's shared error listener's to handle. Returns the unsubscribe.
 */
export function watchApply(
	subscribe: ApplySubscribe,
	id: string,
	onDone: (blocked: BlockedNode[]) => void,
): () => void {
	const blocked: BlockedNode[] = [];
	const stop = () => {
		offError();
		offProgress();
	};
	const offError = subscribe.onError((msg) => {
		if (msg.id !== id) return;
		if (msg.severity === 'warning') {
			if (msg.blocked) blocked.push(...msg.blocked);
			return;
		}
		stop();
	});
	const offProgress = subscribe.onProgress((msg) => {
		if (msg.id !== id) return;
		stop();
		onDone(blocked);
	});
	return stop;
}
