/// <reference path="./src/vite-env.d.ts" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ context }) => {
	return {
		plugins: context === 'ui' ? [react()] : [],
		// Main bundle is emitted at ES2017. Plugma's own default for the main context is `es6` (it
		// hard-codes `target: 'es6'` in create-vite-configs.js for both dev and build); our config is
		// merged as mergeConfig's second argument, so this overrides it.
		//
		// The floor is measured — too LOW is the bug we actually hit: at `es6`, esbuild has no native
		// async/await to emit, so it downlevels every async function into a generator plus a Promise
		// driver — 13
		// `function*` bodies in the bundle. Figma's plugin VM (QuickJS-on-wasm) rejects that at
		// bytecode compilation with `InternalError: stack underflow (op=113, pc=263)` and no line
		// of plugin code runs. ES2017 is the first target with native async/await, which removes
		// the generators entirely.
		//
		// The ceiling is precautionary: nothing above ES2017 has been observed failing in Figma, it is
		// just the lowest target known to work. Raising it costs one in-Figma experiment; see
		// docs/agent-guidelines.md §1.
		//
		// `check:dist` enforces both bounds on the built artifact (scripts/check-dist.mjs).
		//
		// This looks inconsistent with src/main/tsconfig.json's `lib: ["ES2020"]`, but they are
		// different things: `lib` declares which types exist, `target` declares which syntax is
		// emitted. All three tsconfigs are `emitDeclarationOnly`, so tsc emits no JS at all and
		// Vite's target is the only one that reaches Figma.
		build: context === 'main' ? { target: 'es2017' } : {},
	};
});
