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
import { expandForLanguage, isUnsupportedLanguage } from './expand';
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
	// Absent wherever a magnitude is not derivable (LS-8.2 §2.1) — same omit-don't-send-undefined
	// discipline as `severity` and `reason`.
	if (m.overflowPx !== undefined) verdict.overflowPx = m.overflowPx;
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

export interface ScanOptions {
	onProgress?: (completed: number, total: number) => void;
	/** Flushed on the same 25-node tick: the verdicts accumulated since the last flush, never the
	 *  running total. The UI accumulates (LS-8.2 §1.2). */
	onVerdicts?: (chunk: OverflowVerdict[]) => void;
	/** Consulted between nodes. Breaking mid-scan is safe by construction: `measureOverflow` removes
	 *  its clone in a `finally`, so an abandoned scan cannot orphan a clone on the user's page. */
	shouldStop?: () => boolean;
}

/** One OverflowVerdict per eligible node × target language. Hidden nodes are excluded entirely
 *  (an invisible node cannot break a layout); locked and instance nodes measure normally —
 *  measurement is read-only, it clones. Progress is per node, `total` = eligible node count. */
export async function scanOverflow(
	scope: ScanScope,
	targetLanguages: readonly string[],
	options: ScanOptions = {},
): Promise<OverflowVerdict[]> {
	const { onProgress, onVerdicts, shouldStop } = options;
	const models = await traverse(scope);
	const eligible = models.filter((model) => !model.hidden);
	const supported = targetLanguages.filter((language) => !isUnsupportedLanguage(language));
	const verdicts: OverflowVerdict[] = [];

	let completed = 0;
	let flushed = 0; // index into `verdicts` of the first not-yet-streamed row
	let reported = 0; // `completed` at the last progress tick, so the final tick can't double-fire

	const tick = (): void => {
		if (completed === reported) return;
		reported = completed;
		onProgress?.(completed, eligible.length);
		if (onVerdicts !== undefined && verdicts.length > flushed) {
			onVerdicts(verdicts.slice(flushed));
			flushed = verdicts.length;
		}
	};

	for (const model of eligible) {
		// Checked at the top of each iteration. Cancellation is only possible at all because the loop
		// awaits `loadFontAsync` and `getNodeByIdAsync` per node and therefore yields to
		// `figma.ui.onmessage` (LS-8.2 §1.1.4).
		if (shouldStop?.() === true) break;

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
				if (isUnsupportedLanguage(language)) {
					verdicts.push(refusalVerdict(model, language));
				} else {
					const m = measurements?.[supported.indexOf(language)];
					if (m !== undefined) verdicts.push(toVerdict(model, language, m));
				}
			}
		}

		completed++;
		if (completed % PROGRESS_EVERY === 0) tick();
	}

	// A final tick on completion AND on stop. The `completed % PROGRESS_EVERY === 0` guard alone
	// means a 30-node scan reports `25 of 30` and never `30 of 30`, and a scan of fewer than 25
	// nodes reports nothing at all. The panel's stop copy depends on an exact `completed`, so this
	// is required, not cosmetic. `reported` makes it a no-op when the loop already ended on a
	// multiple of 25 (LS-8.2 §1.1.4).
	tick();
	return verdicts;
}

/** Wires `overflow-scan-request`, `overflow-scan-cancel` and `select-node`. Called once from
 *  main.ts. */
export function registerOverflow(): void {
	// The scan in flight, if any. Cancellation is correlated by id rather than being a bare flag, so
	// a stale cancel arriving after one scan ended cannot silently kill the next one.
	let active: { id: string; stopped: boolean } | null = null;

	on('overflow-scan-cancel', (msg) => {
		if (active !== null && active.id === msg.id) active.stopped = true;
	});

	on('overflow-scan-request', (msg) => {
		void (async () => {
			const scan = { id: msg.id, stopped: false };
			active = scan;
			try {
				const verdicts = await scanOverflow(msg.scope, msg.targetLanguages, {
					onProgress: (completed, total) => {
						send({ type: 'progress', id: msg.id, completed, total });
					},
					onVerdicts: (chunk) => {
						send({ type: 'overflow-scan-partial', id: msg.id, verdicts: chunk });
					},
					shouldStop: () => scan.stopped,
				});
				// Zero text nodes is a valid empty result, not an error (matches LS-3). `stopped` rides
				// the result rather than being inferred UI-side: a cancel landing in the same tick a
				// scan finishes naturally would otherwise have the panel assert a stop that never
				// happened (LS-8.2 §1.2).
				respond<'overflow-scan-request'>(msg.id, {
					type: 'overflow-scan-result',
					verdicts,
					stopped: scan.stopped,
				});
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
			} finally {
				if (active === scan) active = null;
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
