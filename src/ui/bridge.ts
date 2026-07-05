// src/ui/bridge.ts  (iframe; uses window/parent)
//
// UI-side transport for the typed message bridge. Owns the single `window` 'message' listener and
// multiplexes it to typed handlers, resolves outstanding `request()` promises by correlation id,
// and mints the ids. Feature code (LS-5+) uses `send`/`request`/`on` and never touches the raw
// listener or `parent.postMessage` directly.
import { isPluginMessage, type UiToMain, type MainToUi, type RequestResponse } from '../common/messages';

type MainHandler = (msg: MainToUi) => void;

interface Pending {
	resolve: (msg: MainToUi) => void;
	reject: (err: MainToUi) => void;
}

const handlers = new Map<MainToUi['type'], Set<MainHandler>>();
const pending = new Map<string, Pending>();

// Counter-based id minting — no environment assumptions (crypto.randomUUID isn't guaranteed).
let seq = 0;

function nextId(): string {
	return `ui-${(seq++).toString(36)}`;
}

// The single shared inbound listener. Guard-and-drop runs before anything else; then a message
// correlated to a pending request settles that promise, otherwise it fans out to `on()` handlers.
window.addEventListener('message', (event: MessageEvent) => {
	const message: unknown = event.data?.pluginMessage;
	if (!isPluginMessage(message)) return;

	const waiter = pending.get(message.id);
	if (waiter) {
		pending.delete(message.id);
		if (message.type === 'error') waiter.reject(message);
		else waiter.resolve(message as MainToUi);
		return;
	}

	const set = handlers.get(message.type as MainToUi['type']);
	if (!set) return;
	for (const handler of set) handler(message as MainToUi);
});

/** Send a UI→main message. The bridge mints and attaches the `id`, posts it wrapped as
 *  { pluginMessage }, and returns the id so callers can correlate later progress/error. Use for
 *  the fire-and-forget apply/revert commands. */
export function send<M extends UiToMain>(msg: Omit<M, 'id'>): string {
	const id = nextId();
	parent.postMessage({ pluginMessage: { ...msg, id } }, '*');
	return id;
}

/** Send a request and resolve with its typed response, matched by id. Rejects if main answers
 *  with an `error` carrying the same id. No timeout — a request handler is contractually obliged
 *  to answer (result or error), which also covers long scans (LS-15). */
export function request<T extends keyof RequestResponse>(
	type: T,
	fields: Omit<Extract<UiToMain, { type: T }>, 'type' | 'id'>,
): Promise<RequestResponse[T]> {
	const id = nextId();
	return new Promise<RequestResponse[T]>((resolve, reject) => {
		pending.set(id, {
			resolve: (msg) => resolve(msg as RequestResponse[T]),
			reject: (err) => reject(err),
		});
		parent.postMessage({ pluginMessage: { type, ...fields, id } }, '*');
	});
}

/** Register a typed handler for one inbound message type (e.g. 'progress', 'error',
 *  'extraction-result'). Returns an unsubscribe fn. One shared window 'message' listener
 *  unwraps event.data.pluginMessage, validates with isPluginMessage, and dispatches. */
export function on<T extends MainToUi['type']>(
	type: T,
	handler: (msg: Extract<MainToUi, { type: T }>) => void,
): () => void {
	let set = handlers.get(type);
	if (!set) {
		set = new Set();
		handlers.set(type, set);
	}
	const entry = handler as MainHandler;
	set.add(entry);
	return () => {
		set.delete(entry);
		if (set.size === 0) handlers.delete(type);
	};
}
