import js from '@eslint/js';
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
				// projectService (not `project: true`) so files intentionally kept out of the
				// composite build tsconfigs — e.g. *.test.ts, excluded to keep the ambient-free
				// `common` build free of vitest's DOM/Node type graph — still get typed linting
				// via the inferred default project.
				projectService: {
					allowDefaultProject: ['src/*/*.test.ts', 'src/*/*/*.test.ts'],
				},
				tsconfigRootDir: import.meta.dirname,
			},
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
