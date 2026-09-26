import { useEffect, useRef } from 'react';

/**
 * Modal focus handling shared by the Export and Import modals (LS-34): on open, focus moves to the
 * dialog's first focusable control; Tab and Shift-Tab wrap inside it; Esc calls `onClose`; on close,
 * focus goes back to whatever had it before the modal opened.
 *
 * Put `ref` and `tabIndex={-1}` on the `role="dialog"` element (so a click inside it keeps focus there). The index arithmetic is the pure
 * `nextFocusIndex` below, unit-tested; the DOM half is an in-Figma check (no jsdom, §6).
 */
export function useModalFocus(onClose: () => void) {
	const ref = useRef<HTMLDivElement>(null);
	// Read at key time, so a parent passing a fresh closure each render needs no re-subscription.
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		focusables(ref.current)[0]?.focus();
		const detach = attachModalKeys(
			document,
			() => focusables(ref.current),
			() => document.activeElement,
			() => onCloseRef.current(),
		);
		return () => {
			detach();
			// The opener may be gone (unmounted with its panel state) — then there is nothing to return to.
			if (previous !== null && previous.isConnected) previous.focus();
		};
	}, []);

	return { ref };
}

/**
 * Esc and the Tab trap, listened for on `target` (the document) rather than on the dialog, so they
 * still work once focus has left it — a click on the dialog's padding, or a busy primary disabled
 * while focused, drops focus to the body (LS-34 final review). Returns the detach function.
 */
export function attachModalKeys(
	target: EventTarget,
	items: () => readonly { focus(): void }[],
	active: () => unknown,
	onClose: () => void,
): () => void {
	const onKeyDown = (event: Event) => {
		const { key, shiftKey } = event as KeyboardEvent;
		if (key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onClose();
			return;
		}
		if (key !== 'Tab') return;
		const list = items();
		const focused = active();
		const next = nextFocusIndex(
			list.findIndex((item) => item === focused),
			list.length,
			shiftKey,
		);
		event.preventDefault();
		if (next !== null) list[next]?.focus();
	};
	target.addEventListener('keydown', onKeyDown);
	return () => target.removeEventListener('keydown', onKeyDown);
}

/**
 * The control Tab (or Shift-Tab, `backward`) moves to, given the index of the focused one among
 * `count` focusable controls — wrapping at both ends. `current` is -1 when focus is not on any of
 * them; it then enters at the first (Tab) or last (Shift-Tab). Null when there is nothing to focus.
 */
export function nextFocusIndex(current: number, count: number, backward: boolean): number | null {
	if (count === 0) return null;
	if (current < 0) return backward ? count - 1 : 0;
	return backward ? (current - 1 + count) % count : (current + 1) % count;
}

const FOCUSABLE =
	'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** In DOM order, which is tab order here (no positive tabindex anywhere on the surface). A control
 *  that renders no box — the Import modal's `display: none` file input — is skipped. */
function focusables(root: HTMLElement | null): HTMLElement[] {
	if (root === null) return [];
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}
