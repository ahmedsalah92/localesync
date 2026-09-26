import { useState } from 'react';
import type { OpenWaitlist } from '../../common/messages';
import { PRO_LABEL, type ProPillar } from '../../common/pro';
import { send } from '../bridge';
import { BAND_HEIGHT } from './geometry';
import { ArrowIcon } from './icons/ArrowIcon';
import { Tooltip } from './primitives/Tooltip';

export const PRO_TOOLTIP =
	"Coming soon in Pro. Opens the waitlist in your browser. LocaleSync doesn't send any data from the plugin.";

function openWaitlist(pillar: ProPillar): void {
	send<OpenWaitlist>({ type: 'open-waitlist', pillar });
}

/**
 * A Pro pillar's footer band (LS-13 §2.3, the `Pro Stub` component set, 350:1404 et al.): one
 * button that opens the waitlist in the browser, tagged with its pillar. No modal, no in-plugin Pro
 * screen, and nothing sent from the plugin itself — the main thread only calls figma.openExternal.
 *
 * Its own module rather than a helper inside panels.tsx, because `panels.tsx` imports the panels
 * and the panels need this footer: keeping it there would be an import cycle.
 */
export function ProStub(props: { pillar: ProPillar; onOpen?: (pillar: ProPillar) => void }) {
	const [hover, setHover] = useState(false);
	const label = PRO_LABEL[props.pillar];
	const onOpen = props.onOpen ?? openWaitlist;

	return (
		<div style={{ height: BAND_HEIGHT, flexShrink: 0, display: 'flex' }}>
			<Tooltip label={PRO_TOOLTIP} wide placement="top" fill>
				<button
					type="button"
					aria-label={`${label} — ${PRO_TOOLTIP}`}
					onClick={() => {
						onOpen(props.pillar);
					}}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
					style={{
						width: '100%',
						height: BAND_HEIGHT,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: `0 var(--spacer-3)`,
						border: 'none',
						borderTop: '1px solid var(--ls-border-default)',
						backgroundColor: hover ? 'var(--ls-bg-hover)' : 'transparent',
						color: 'var(--ls-text-default)',
						fontSize: 'var(--ls-text-size)',
						lineHeight: 'var(--ls-text-line)',
						letterSpacing: 'var(--ls-text-tracking)',
						fontFamily: 'inherit',
						cursor: 'pointer',
					}}
				>
					<span style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-2)' }}>
						<span>{label}</span>
						<span
							style={{
								padding: `0 var(--spacer-1)`,
								border: '1px solid var(--ls-border-brand)',
								borderRadius: 'var(--radius-small)',
								color: 'var(--ls-text-brand)',
							}}
						>
							Pro
						</span>
					</span>
					<span style={{ display: 'flex', color: 'var(--ls-icon-secondary)' }}>
						<ArrowIcon />
					</span>
				</button>
			</Tooltip>
		</div>
	);
}
