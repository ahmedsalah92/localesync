import js from '@eslint/js';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import tsParser from '@typescript-eslint/parser';
import * as figmaPlugin from '@figma/eslint-plugin-figma-plugins';

export default defineConfig([
	js.configs.recommended,
	...tseslint.configs.recommended,

	globalIgnores(['node_modules/**', 'dist/**', '*.config.{js,ts}', '**/*.d.ts']),

	// Base configuration
	{
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},

	// Test files: projectService discovers a file's project by walking up for a file literally
	// named "tsconfig.json" — it never considers the sibling tsconfig.test.json (LS-22), no
	// matter what the solution file references. Point the classic `project` resolver at the
	// three test configs directly instead; every *.test.ts(x) now belongs to one of them, so no
	// default-project allowance is needed.
	{
		files: ['src/*/*.test.ts', 'src/*/*/*.test.ts'],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: [
					'src/common/tsconfig.test.json',
					'src/main/tsconfig.test.json',
					'src/ui/tsconfig.test.json',
				],
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},

	// Standalone repo scripts — plain Node ESM, deliberately outside the three composite TS
	// projects, so the typed project service does not apply to them.
	{
		files: ['scripts/**/*.mjs'],
		languageOptions: {
			parserOptions: { projectService: false },
			globals: globals.node,
		},
	},

	// Main thread specifics
	{
		files: ['src/main/**/*.ts'],
		languageOptions: {
			globals: { figma: 'readonly', __html__: 'readonly' },
		},
		plugins: {
			'@figma/figma-plugins': figmaPlugin,
		},
		rules: {
			'@typescript-eslint/triple-slash-reference': 'off',
			...figmaPlugin.flatConfigs.recommended.rules,
		},
	},

	// UI specifics (update as needed)
	{
		files: ['src/ui/**/*.{ts,tsx,svelte,vue}'],
	},
]);
