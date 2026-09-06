import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { clampWindowSize } from '../../common/shell';
import type { ResizeWindow } from '../../common/messages';
import { send } from '../bridge';

type ResizeAxes = 'height' | 'both';

interface Gesture {
	axes: ResizeAxes;
	pointerId: number;
	grabOffsetX: number;
	grabOffsetY: number;
	messageId: string | null;
}

export function ResizeHandle(): JSX.Element {
	const gesture = useRef<Gesture | null>(null);

	function start(axes: ResizeAxes, event: ReactPointerEvent<HTMLDivElement>): void {
		if (gesture.current !== null) return;
		gesture.current = {
			axes,
			pointerId: event.pointerId,
			grabOffsetX: window.innerWidth - event.clientX,
			grabOffsetY: window.innerHeight - event.clientY,
			messageId: null,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function move(event: ReactPointerEvent<HTMLDivElement>): void {
		const active = gesture.current;
		if (active === null || active.pointerId !== event.pointerId) return;

		const size = clampWindowSize({
			width: active.axes === 'both' ? event.clientX + active.grabOffsetX : window.innerWidth,
			height: event.clientY + active.grabOffsetY,
		});
		const message: Omit<ResizeWindow, 'id'> = { type: 'resize-window', ...size };
		active.messageId = send<ResizeWindow>(message, active.messageId ?? undefined);
	}

	function end(event: ReactPointerEvent<HTMLDivElement>): void {
		const active = gesture.current;
		if (active === null || active.pointerId !== event.pointerId) return;
		gesture.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}

	return (
		<>
			<div
				style={{
					position: 'fixed',
					left: 0,
					right: 16,
					bottom: 0,
					height: 4,
					cursor: 'ns-resize',
					touchAction: 'none',
				}}
				onPointerDown={(event) => start('height', event)}
				onPointerMove={move}
				onPointerUp={end}
				onPointerCancel={end}
				onLostPointerCapture={end}
			/>
			<div
				style={{
					position: 'fixed',
					right: 0,
					bottom: 0,
					width: 16,
					height: 16,
					cursor: 'nwse-resize',
					touchAction: 'none',
				}}
				onPointerDown={(event) => start('both', event)}
				onPointerMove={move}
				onPointerUp={end}
				onPointerCancel={end}
				onLostPointerCapture={end}
			/>
		</>
	);
}
