// src/ui/bridge.ts  (iframe; uses window/parent)
//
// UI-side transport for the typed message bridge. Owns the single `window` 'message' listener and
// multiplexes it to typed handlers, resolves outstanding `request()` promises by correlation id,
// and mints the ids. Feature code (LS-5+) uses `send`/`request`/`on` and never touches the raw
// listener or `parent.postMessage` directly.
import {
	isPluginMessage,
	RESPONSE_TYPE,
	type UiToMain,
	type MainToUi,
	type RequestResponse,
} from '../common/messages';

type MainHandler = (msg: MainToUi) => void;

interface Pending {
	/** The response type this request settles on. Anything else carrying the same id — a `progress`
	 *  tick, a streamed `overflow-scan-partial` — falls through to the `on()` handlers instead of
	 *  resolving the promise with the wrong message (LS-8.2 §1.4). */
	expect: MainToUi['type'];
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

	// Settle ONLY on the awaited response type, or on a correlated error. Matching on the id alone
	// was wrong: a request's own id is exactly what main echoes on its `progress` ticks and, since
	// LS-8.2, on its streamed `overflow-scan-partial` chunks — correct per LS-2's correlation
	// design. So the first tick resolved the promise with a ProgressMessage cast to the response
	// type, deleted the waiter, and left the real result to arrive and find nothing waiting; the
	// caller read `verdicts` as undefined. PROGRESS_EVERY is 25 and overflow-spike.fig has 14 rows,
	// so the acceptance fixture passed and real files failed (LS-8.2 §1.4).
	const waiter = pending.get(message.id);
	if (waiter && (message.type === waiter.expect || message.type === 'error')) {
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
 *  the fire-and-forget apply/revert commands.
 *
 *  Pass `id` explicitly to address an exchange already in flight — that is how
 *  `overflow-scan-cancel` rides the correlation id of the scan it cancels (LS-8.2 §2.8). */
export function send<M extends UiToMain>(msg: Omit<M, 'id'>, id: string = nextId()): string {
	parent.postMessage({ pluginMessage: { ...msg, id } }, '*');
	return id;
}

/** A request in flight: its correlation id, and the promise that settles on its mapped response.
 *  The id is what streamed `overflow-scan-partial` / `progress` messages and the matching
 *  `overflow-scan-cancel` are correlated on. */
export interface InFlightRequest<T extends keyof RequestResponse> {
	id: string;
	response: Promise<RequestResponse[T]>;
}

/** `request()`, with the correlation id exposed. Use this when the exchange is a stream rather than
 *  a plain round trip — when the caller must also match the mid-flight `progress` / partial
 *  messages main sends under the same id, or address a command back at it. */
export function requestWithId<T extends keyof RequestResponse>(
	type: T,
	fields: Omit<Extract<UiToMain, { type: T }>, 'type' | 'id'>,
): InFlightRequest<T> {
	const id = nextId();
	const response = new Promise<RequestResponse[T]>((resolve, reject) => {
		pending.set(id, {
			expect: RESPONSE_TYPE[type],
			resolve: (msg) => resolve(msg as RequestResponse[T]),
			reject: (err) => reject(err),
		});
		parent.postMessage({ pluginMessage: { type, ...fields, id } }, '*');
	});
	return { id, response };
}

/** Send a request and resolve with its typed response, matched by id AND by response type. Rejects
 *  if main answers with an `error` carrying the same id. Messages that share the id but are not the
 *  awaited response — `progress`, `overflow-scan-partial` — reach `on()` handlers instead. No
 *  timeout — a request handler is contractually obliged to answer (result or error), which also
 *  covers long scans (LS-15). */
export function request<T extends keyof RequestResponse>(
	type: T,
	fields: Omit<Extract<UiToMain, { type: T }>, 'type' | 'id'>,
): Promise<RequestResponse[T]> {
	return requestWithId(type, fields).response;
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
