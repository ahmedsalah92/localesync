// src/main/overflow/jump.ts
//
// What the shared `select-node` handler may select. Pure — Vitest-tested without `figma`.
//
// LS-8.1 §385 originally accepted TEXT only, because overflow rows are text. Extract, Pseudo and
// RTL now share the handler, and RTL's "icons moved" rows are ellipses and vectors — under the old
// rule every one answered node-gone and the jump silently did nothing (LS-28). Any layer on the
// canvas is a valid target; only a deleted node, a page or the document is not.

type NotALayer = { type: 'PAGE' } | { type: 'DOCUMENT' };

export function isJumpTarget<N extends { type: string }>(node: N | null): node is Exclude<N, NotALayer> {
	return node !== null && node.type !== 'PAGE' && node.type !== 'DOCUMENT';
}
