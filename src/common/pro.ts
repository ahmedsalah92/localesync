// src/common/pro.ts — the Pro waitlist handoff (LS-13 §1.3). Pure; imported by main and UI.
//
// A browser navigation, not a fetch: the main thread opens this URL with figma.openExternal, the
// landing page's Umami records the visit, and the plugin itself sends nothing — so it ships with
// `allowedDomains: ["none"]` (agent-guidelines §2).

export type ProPillar = 'matrix' | 'report' | 'translate' | 'sync';

/** The permanent waitlist path (D2). It is compiled into the plugin, so it must keep resolving: a
 *  moved landing page redirects here with the query string intact, or Umami loses `utm_content`. */
export const WAITLIST_URL = 'https://localesync.dev/waitlist';
/** The reserved placeholder this URL replaced. `npm run check:release` fails if it ever returns (D6). */
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
