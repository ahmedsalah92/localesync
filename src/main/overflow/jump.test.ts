// src/main/overflow/jump.test.ts — pure unit tests (no `figma`, no DOM).
import { describe, expect, it } from 'vitest';
import { isJumpTarget } from './jump';

describe('isJumpTarget — what the shared select-node handler may select', () => {
	// The regression: the handler accepted TEXT only (LS-8.1 §385), so every RTL "icons moved" row —
	// an ellipse or vector — answered node-gone and the jump silently did nothing (found in LS-28).
	it.each(['TEXT', 'ELLIPSE', 'VECTOR', 'FRAME', 'INSTANCE', 'GROUP', 'BOOLEAN_OPERATION'])(
		'accepts a %s layer',
		(type) => {
			expect(isJumpTarget({ type })).toBe(true);
		},
	);

	// Not layers: nothing to select on the canvas.
	it.each(['PAGE', 'DOCUMENT'])('rejects a %s', (type) => {
		expect(isJumpTarget({ type })).toBe(false);
	});

	it('rejects a deleted node', () => {
		expect(isJumpTarget(null)).toBe(false);
	});
});
