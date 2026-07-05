// src/main/bridge.ts  (main thread; uses the `figma` global)
//
// Main-side transport for the typed message bridge. Owns the single `figma.ui.onmessage` slot and
// multiplexes it to typed handlers. Feature code (LS-3+) registers handlers via `on()` and never
// touches the raw listener or `figma.ui.postMessage` directly.
import { isPluginMessage, type UiToMain, type MainToUi, type RequestResponse } from '../common/messages';

type UiHandler = (msg: UiToMain) => void;

// One shared registry, keyed by message type. `on()` adds; the returned unsubscribe removes.
const handlers = new Map<UiToMain['type'], Set<UiHandler>>();

// Counter for main-originated unsolicited notifications (no UI request to echo).
let seq = 0;

// The single raw inbound slot. Guard-and-drop runs before any handler; non-conforming messages
// (Plugma dev-harness traffic, anything malformed) are silently ignored.
figma.ui.onmessage = (message: unknown) => {
	if (!isPluginMessage(message)) return;
	const set = handlers.get(message.type as UiToMain['type']);
	if (!set) return;
	// `message` narrowed to AnyMessage; a handler is only ever registered for a UiToMain type, so
	// the cast is sound for the set we just looked up.
	for (const handler of set) handler(message as UiToMain);
};

/** Send a message to the UI. `id` must already be set (echoed from a request, or minted for an
 *  unsolicited notification via `nextMainId()`). */
export function send(msg: MainToUi): void {
	figma.ui.postMessage(msg);
}

/** Answer a request: attaches the request's id to `result` and sends it. Use for the three
 *  request/response pairs. */
export function respond<T extends keyof RequestResponse>(
	requestId: string,
	result: Omit<RequestResponse[T], 'id'>,
): void {
	// `result` is a RequestResponse[T] minus its id; re-attaching the request id reconstitutes a
	// full response envelope. The double cast is needed only because T is generic here — every
	// concrete RequestResponse value is a MainToUi member.
	send({ ...result, id: requestId } as unknown as MainToUi);
}

/** Register a typed handler for one inbound message type. Returns an unsubscribe fn. The bridge
 *  owns `figma.ui.onmessage`; handlers never touch it directly. Inbound messages are validated
 *  with isPluginMessage and non-conforming ones are dropped. */
export function on<T extends UiToMain['type']>(
	type: T,
	handler: (msg: Extract<UiToMain, { type: T }>) => void,
): () => void {
	let set = handlers.get(type);
	if (!set) {
		set = new Set();
		handlers.set(type, set);
	}
	const entry = handler as UiHandler;
	set.add(entry);
	return () => {
		set.delete(entry);
		if (set.size === 0) handlers.delete(type);
	};
}

/** Mint an id for a main-originated unsolicited message (e.g. an error during restore-on-launch,
 *  which no UI request triggered). Counter-based: `main-<n>`. */
export function nextMainId(): string {
	return `main-${(seq++).toString(36)}`;
}
