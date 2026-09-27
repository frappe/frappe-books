import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['test-results/', 'playwright-report/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/essential'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-console': ['error', { allow: ['error'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      // Fyo documents are mutable models, so controls set fields on them.
      'vue/no-mutating-props': ['error', { shallowOnly: true }],
      // These need changes across most of the app.
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/no-reserved-component-names': 'off',
      // Style only.
      'no-extra-boolean-cast': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        lib: ['esnext', 'dom', 'dom.iterable'],
      },
    },
  },
  {
    files: ['postcss.config.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
