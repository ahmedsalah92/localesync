// src/main/overflow/index.ts  (main thread; uses the `figma` global)
//
// LS-8 public API: the overflow scan orchestrator and its message wiring. scanOverflow() walks the
// scope via LS-3's traverse, synthesises per-language candidates (expand.ts), measures them on one
// off-canvas clone per node (measure.ts), and projects Measurements into wire OverflowVerdicts.
// Measurement never touches the snapshot primitive (LS-4) — importing ../snapshot here is a spec
// violation, not an optimisation (LS-8 §1).
import type { ScanScope } from '../../common/messages';
import type { OverflowVerdict } from '../../common/models';
import { on, respond, send } from '../bridge';
import { NoSelectionError, traverse } from '../traversal';
import type { TextNodeModel } from '../traversal/model';
import { UNSUPPORTED_LANGUAGES, expandForLanguage } from './expand';
import type { Measurement } from './measure';
import { measureOverflow } from './measure';
import { severityFor } from './verdict';

const PROGRESS_EVERY = 25;

function toVerdict(model: TextNodeModel, language: string, m: Measurement): OverflowVerdict {
	const verdict: OverflowVerdict = {
		nodeId: model.nodeId,
		language,
		verdict: m.verdict,
		characters: model.characters,
		containerLabel: model.containerLabel,
		candidate: m.candidate,
		measuredWidth: m.measuredWidth,
		measuredHeight: m.measuredHeight,
	};
	// `fits` carries no severity — omit the field rather than sending undefined (LS-8 §2).
	const severity = severityFor(m.verdict);
	if (severity !== undefined) verdict.severity = severity;
	if (m.reason !== undefined) verdict.reason = m.reason;
	return verdict;
}

/** CJK/Thai refusal row: no candidate is synthesised and no clone is ever created (LS-8 §2). */
function refusalVerdict(model: TextNodeModel, language: string): OverflowVerdict {
	return {
		nodeId: model.nodeId,
		language,
		verdict: 'unmeasurable',
		severity: severityFor('unmeasurable'),
		reason: 'unsupported-language',
		characters: model.characters,
		containerLabel: model.containerLabel,
		candidate: '',
		measuredWidth: 0,
		measuredHeight: 0,
	};
}

/** One OverflowVerdict per eligible node × target language. Hidden nodes are excluded entirely
 *  (an invisible node cannot break a layout); locked and instance nodes measure normally —
 *  measurement is read-only, it clones. Progress is per node, `total` = eligible node count. */
export async function scanOverflow(
	scope: ScanScope,
	targetLanguages: readonly string[],
	onProgress?: (completed: number, total: number) => void,
): Promise<OverflowVerdict[]> {
	const models = await traverse(scope);
	const eligible = models.filter((model) => !model.hidden);
	const supported = targetLanguages.filter((language) => !UNSUPPORTED_LANGUAGES.has(language));
	const verdicts: OverflowVerdict[] = [];

	let completed = 0;
	for (const model of eligible) {
		let measurements: Measurement[] | null = null;
		if (supported.length > 0) {
			const candidates = supported.map((language) => expandForLanguage(model.characters, language));
			// The durable cross-message handle is nodeId (LS-3): re-fetch the live node for cloning.
			const live = await figma.getNodeByIdAsync(model.nodeId);
			if (live !== null && live.type === 'TEXT') {
				measurements = await measureOverflow({ node: live, model, candidates });
			}
		}

		// A node deleted between traverse and measure is dropped entirely — an absent node cannot
		// break a layout (mirrors the hidden rule; refusal-only scans never re-fetch, so they keep
		// their rows).
		const vanished = supported.length > 0 && measurements === null;
		if (!vanished) {
			for (const language of targetLanguages) {
				if (UNSUPPORTED_LANGUAGES.has(language)) {
					verdicts.push(refusalVerdict(model, language));
				} else {
					const m = measurements?.[supported.indexOf(language)];
					if (m !== undefined) verdicts.push(toVerdict(model, language, m));
				}
			}
		}

		completed++;
		if (completed % PROGRESS_EVERY === 0) onProgress?.(completed, eligible.length);
	}
	return verdicts;
}

/** Wires `overflow-scan-request` and `select-node`. Called once from main.ts. */
export function registerOverflow(): void {
	on('overflow-scan-request', (msg) => {
		void (async () => {
			try {
				const verdicts = await scanOverflow(msg.scope, msg.targetLanguages, (completed, total) => {
					send({ type: 'progress', id: msg.id, completed, total });
				});
				// Zero text nodes is a valid empty result, not an error (matches LS-3).
				respond<'overflow-scan-request'>(msg.id, { type: 'overflow-scan-result', verdicts });
			} catch (err) {
				if (err instanceof NoSelectionError) {
					send({ type: 'error', id: msg.id, code: 'no-selection', severity: 'error', message: err.message });
				} else {
					send({
						type: 'error',
						id: msg.id,
						code: 'internal',
						severity: 'error',
						message: `Overflow scan failed: ${err instanceof Error ? err.message : String(err)}`,
					});
				}
			}
		})();
	});

	// Command, not request: success is silent (the selection change is the feedback); failure is
	// reported on `error` / `node-gone`, correlated by id.
	on('select-node', (msg) => {
		void (async () => {
			const nodeGone = (detail: string): void => {
				send({
					type: 'error',
					id: msg.id,
					code: 'node-gone',
					severity: 'error',
					message: `Can't jump to that node — ${detail}`, // LS-14 owns final copy
				});
			};
			try {
				const node = await figma.getNodeByIdAsync(msg.nodeId);
				if (node === null || node.type !== 'TEXT') {
					nodeGone('it was deleted or is no longer a text node');
					return;
				}
				figma.currentPage.selection = [node];
				figma.viewport.scrollAndZoomIntoView([node]);
			} catch (err) {
				// A node on another page throws under dynamic-page (LS-8 §2).
				nodeGone(err instanceof Error ? err.message : String(err));
			}
		})();
	});
}
