// src/main/env.d.ts — minimal Vite env surface for the main-thread build. Plugma bundles main
// with Vite, which statically replaces import.meta.env.DEV; the main tsconfig deliberately
// excludes vite/client (its ambient graph assumes DOM), so declare only the flag main.ts uses.
interface ImportMeta {
	readonly env: {
		readonly DEV: boolean;
	};
}
