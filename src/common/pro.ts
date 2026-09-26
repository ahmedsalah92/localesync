// src/common/pro.ts — the Pro waitlist handoff (LS-13 §1.3). Pure; imported by main and UI.
//
// A browser navigation, not a fetch: the main thread opens this URL with figma.openExternal, the
// landing page's Umami records the visit, and the plugin itself sends nothing — so it ships with
// `allowedDomains: ["none"]` (agent-guidelines §2).

export type ProPillar = 'matrix' | 'report' | 'translate' | 'sync';

/** D2 placeholder until the waitlist exists. `.invalid` is reserved: it can never resolve.
 *  `npm run check:release` refuses to pass while this is still in the bundle (D6). */
export const WAITLIST_URL = 'https://example.invalid/waitlist';
export const WAITLIST_PLACEHOLDER_HOST = 'example.invalid';

export const PRO_LABEL: Record<ProPillar, string> = {
	matrix: 'Scan all languages at once',
	report: 'Export QA report',
	translate: 'Translate with AI',
	sync: 'Sync with your team',
};

/** One distinct `utm_content` per pillar (D1), so the four intent signals stay separable in Umami.
 *  No user, file or version part — identical for every user. */
export function waitlistUrl(pillar: ProPillar): string {
	return `${WAITLIST_URL}?utm_source=figma&utm_medium=plugin&utm_campaign=pro-waitlist&utm_content=${pillar}`;
}
