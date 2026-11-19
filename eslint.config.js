import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Rules that enforce the architecture in the Technical Design Document:
// systems, core and data are plain TypeScript, testable without Phaser or a browser.
const pureLayer = ['src/systems/**/*.ts', 'src/core/**/*.ts', 'src/data/**/*.ts'];

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: pureLayer,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message: 'systems/, core/ and data/ must not import Phaser (TDD: Architecture).',
            },
          ],
          patterns: [
            {
              group: ['**/scenes/**', '**/entities/**'],
              message: 'Pure layers must not import scenes or entities.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG from core/rng.ts for gameplay randomness.',
        },
        { object: 'Date', property: 'now', message: 'Gameplay timers use the scene clock, not wall time.' },
      ],
      'no-restricted-globals': ['error', 'setTimeout', 'setInterval'],
    },
  },
  {
    files: ['tests/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
