// src/common/pro.test.ts — the waitlist handoff (LS-13 §1.3, D1). Pure.
import { describe, expect, it } from 'vitest';
import { PRO_LABEL, WAITLIST_URL, waitlistUrl, type ProPillar } from './pro';

const PILLARS: ProPillar[] = ['matrix', 'report', 'translate', 'sync'];

describe('waitlistUrl', () => {
	it.each(PILLARS)('tags %s distinctly', (pillar) => {
		expect(waitlistUrl(pillar)).toBe(
			`${WAITLIST_URL}?utm_source=figma&utm_medium=plugin&utm_campaign=pro-waitlist&utm_content=${pillar}`,
		);
	});

	// Review Focus 5 — four distinct signals, never merged.
	it('gives each pillar its own URL', () => {
		expect(new Set(PILLARS.map(waitlistUrl)).size).toBe(4);
	});

	it('is the same for every call — no per-user part', () => {
		expect(waitlistUrl('sync')).toBe(waitlistUrl('sync'));
	});
});

describe('PRO_LABEL — the canvas copy', () => {
	it('matches the four Pro Stub instances', () => {
		expect(PRO_LABEL).toEqual({
			matrix: 'Scan all languages at once',
			report: 'Export QA report',
			translate: 'Translate with AI',
			sync: 'Sync with your team',
		});
	});
});
