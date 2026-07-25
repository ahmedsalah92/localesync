// src/main/devtools/applyBatchLeave.ts
// Dev-only: apply the LS-4 batch transform to every text node on the page and LEAVE it applied, so
// the manual "a single Cmd-Z reverts the whole batch as one step" acceptance (LS-4 §3, the one the
// snapshot check can only print as a reminder) can be observed by hand.
//
// UNLIKE snapshot/check.ts (which applies THEN restores, net-zero), this deliberately does NOT
// restore — the mutation stays on canvas. withSnapshot calls figma.commitUndo() once at the end of
// the batch, so the whole batch is a single undo step: press Cmd-Z once and it should all revert
// together. The durable manifest/pluginData written by withSnapshot self-heals on the next plugin
// launch (restore-on-launch), so reload before saving the fixture if you want a clean file.
//
// Main thread only. Never ships: wired behind import.meta.env.DEV in main.ts.
import { withSnapshot } from '../snapshot';
import type { BatchResult } from '../snapshot';

const DEV_SUFFIX = ' ≋≋≋'; // same stand-in transform as snapshot/check.ts (LS-10 pseudo-loc placeholder)

export async function applyBatchLeave(): Promise<BatchResult> {
	await figma.currentPage.loadAsync(); // dynamic-page: findAllWithCriteria throws on an unloaded page
	const nodes = figma.currentPage.findAllWithCriteria({ types: ['TEXT'] });
	// One withSnapshot call = one batch = one commitUndo checkpoint (Resolved Defaults §4). Ineligible
	// nodes (missing-font, mixed-font, empty) are blocked up front and never touched.
	return withSnapshot(nodes, 'pseudoloc', (node) => {
		node.characters = node.characters + DEV_SUFFIX;
		return Promise.resolve();
	});
}
