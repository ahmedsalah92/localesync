// src/main/overflow/verdict.ts — pure verdict → severity projection (no figma access, no bridge import).
import type { OverflowVerdictValue } from '../../common/models';

/** LS-8 §2: silent overflow is the break the plugin exists to catch (`error`); truncation is
 *  intentional-but-worth-checking (`warn`); `fits` carries no severity — field absent on the wire. */
export function severityFor(verdict: OverflowVerdictValue): 'warn' | 'error' | undefined {
	switch (verdict) {
		case 'overflows':
			return 'error';
		case 'truncates':
		case 'unmeasurable':
			return 'warn';
		case 'fits':
			return undefined;
	}
}
