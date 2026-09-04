import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The discipline test, per docs/specs/LS-5.md §2.7: scans src/ui/** and fails on a hex literal, a
 * raw font-size, or a direct --figma-color-* reference outside styles.css. This is what makes "no
 * hard-coded colours in feature code" an executable criterion instead of a review opinion.
 */

const UI_ROOT = join(__dirname, '..');
const STYLES_CSS = join(UI_ROOT, 'styles.css');
// This file's own source text contains the discipline patterns themselves (as regex literals and
// in prose) — exclude it from the scan it defines rather than rely on none of them coincidentally
// matching their own source.
const SELF = join(__dirname, 'tokens.test.ts');

// Only .ts/.tsx/.css are scanned — .svg assets (the brand mark) are deliberately excluded. Static
// brand images carry fixed Clipped Bar colours by design (agent-guidelines.md §7: identity, not
// chrome, never theme-adaptive) and are outside the token-binding rule this file enforces, which
// targets raw values in *component* code (spec §2.5: "No component file carries a raw value").
function collectFiles(dir: string): string[] {
	const entries = readdirSync(dir);
	const files: string[] = [];
	for (const entry of entries) {
		if (entry === 'node_modules') continue; // build/declaration output, not source
		const full = join(dir, entry);
		const stats = statSync(full);
		if (stats.isDirectory()) {
			files.push(...collectFiles(full));
		} else if (/\.(ts|tsx|css)$/.test(entry)) {
			files.push(full);
		}
	}
	return files;
}

const files = collectFiles(UI_ROOT).filter((f) => f !== STYLES_CSS && f !== SELF);

const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;
const RAW_FONT_SIZE = /font-?[sS]ize\s*[:=]\s*['"`]?\d/;
const FIGMA_COLOR_VAR = /--figma-color-[a-z0-9-]+/i;
// A hardcoded SVG paint is a gap the two checks above don't cover: `fill="black"` (or a stray
// fill-opacity, the shape Figma's flattened stroke exports take) is neither a hex literal nor a
// raw font-size, so it would sail through undetected while still defeating `icon/*` token binding
// in dark mode. Allowed values: "none", "currentColor", or a `var(--ls-*)` reference.
const SVG_PAINT_ATTR = /\b(?:fill|stroke)\s*=\s*["']([^"']*)["']/g;
const FILL_OPACITY_ATTR = /\b(?:fill-opacity|fillOpacity)\s*=/;

function findRawPaint(content: string): string[] {
	const offenders: string[] = [];
	for (const match of content.matchAll(SVG_PAINT_ATTR)) {
		const value = (match[1] ?? '').trim();
		if (value === '' || value === 'none' || value === 'currentColor' || value.startsWith('var(--ls-')) continue;
		offenders.push(match[0]);
	}
	return offenders;
}

describe('tokens.test — no raw values outside styles.css', () => {
	it.each(files.map((f) => [relative(UI_ROOT, f), f] as const))('%s has no hex literal', (_name, file) => {
		const content = readFileSync(file, 'utf8');
		expect(HEX_LITERAL.test(content)).toBe(false);
	});

	it.each(files.map((f) => [relative(UI_ROOT, f), f] as const))('%s has no raw font-size', (_name, file) => {
		const content = readFileSync(file, 'utf8');
		expect(RAW_FONT_SIZE.test(content)).toBe(false);
	});

	it.each(files.map((f) => [relative(UI_ROOT, f), f] as const))(
		'%s has no direct --figma-color-* reference',
		(_name, file) => {
			const content = readFileSync(file, 'utf8');
			expect(FIGMA_COLOR_VAR.test(content)).toBe(false);
		},
	);

	it.each(files.map((f) => [relative(UI_ROOT, f), f] as const))(
		'%s has no hardcoded SVG paint (fill/stroke must be none, currentColor, or a --ls-* var)',
		(_name, file) => {
			const content = readFileSync(file, 'utf8');
			expect(findRawPaint(content)).toEqual([]);
		},
	);

	it.each(files.map((f) => [relative(UI_ROOT, f), f] as const))('%s has no fill-opacity attribute', (_name, file) => {
		const content = readFileSync(file, 'utf8');
		expect(FILL_OPACITY_ATTR.test(content)).toBe(false);
	});

	it('styles.css itself has no hex literal, and is the only place --figma-color-* appears', () => {
		// Raw font-size is expected here — the type scale has no injected source and is declared
		// locally (spec §2.5), same as the pre-existing base `body`/`:root` font-size rules. Hex,
		// though, is banned even in styles.css: colours bind rather than resolve (spec §2.7).
		const content = readFileSync(STYLES_CSS, 'utf8');
		expect(HEX_LITERAL.test(content)).toBe(false);
		expect(FIGMA_COLOR_VAR.test(content)).toBe(true);
	});
});
