// src/ui/pseudo/watchApply.test.ts — one apply's own listeners, removed however it ends (LS-34). Pure.
import { describe, expect, it } from 'vitest';
import type { ErrorMessage, ProgressMessage } from '../../common/messages';
import type { BlockedNode } from '../../common/models';
import { watchApply } from './watchApply';

/** A two-channel stand-in for the bridge: counts live handlers so a leak is observable. */
function fakeBus() {
	const errors = new Set<(msg: ErrorMessage) => void>();
	const progress = new Set<(msg: ProgressMessage) => void>();
	return {
		subscribe: {
			onError: (h: (msg: ErrorMessage) => void) => {
				errors.add(h);
				return () => errors.delete(h);
			},
			onProgress: (h: (msg: ProgressMessage) => void) => {
				progress.add(h);
				return () => progress.delete(h);
			},
		},
		error: (msg: Omit<ErrorMessage, 'type'>) => [...errors].forEach((h) => h({ type: 'error', ...msg })),
		progress: (id: string) => [...progress].forEach((h) => h({ type: 'progress', id, completed: 1, total: 1 })),
		live: () => errors.size + progress.size,
	};
}

const blockedNode: BlockedNode = { nodeId: '1:2', reason: 'missing-font' };

describe('watchApply', () => {
	it('collects nodes-blocked warnings and hands them over on the terminal progress, then unsubscribes', () => {
		const bus = fakeBus();
		const done: unknown[] = [];
		watchApply(bus.subscribe, 'a1', (blocked) => done.push(blocked));
		expect(bus.live()).toBe(2);
		bus.error({ id: 'a1', code: 'nodes-blocked', severity: 'warning', message: '', blocked: [blockedNode] });
		bus.progress('a1');
		expect(done).toEqual([[blockedNode]]);
		expect(bus.live()).toBe(0);
	});

	it('ignores another exchange’s messages', () => {
		const bus = fakeBus();
		const done: unknown[] = [];
		watchApply(bus.subscribe, 'a1', (blocked) => done.push(blocked));
		bus.error({ id: 'x', code: 'internal', severity: 'error', message: '' });
		bus.progress('x');
		expect(done).toEqual([]);
		expect(bus.live()).toBe(2);
	});

	// The leak: a failed apply never sends a terminal progress, so its listeners stayed forever.
	it('unsubscribes both listeners when the apply fails, without finishing it', () => {
		const bus = fakeBus();
		const done: unknown[] = [];
		watchApply(bus.subscribe, 'a1', (blocked) => done.push(blocked));
		bus.error({ id: 'a1', code: 'mutation-failed', severity: 'error', message: '' });
		expect(bus.live()).toBe(0);
		expect(done).toEqual([]);
	});

	it('keeps listening through a warning', () => {
		const bus = fakeBus();
		watchApply(bus.subscribe, 'a1', () => {});
		bus.error({ id: 'a1', code: 'nodes-blocked', severity: 'warning', message: '', blocked: [] });
		expect(bus.live()).toBe(2);
	});
});
