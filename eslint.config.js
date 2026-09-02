import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['data/**', 'coverage/**', '.tmp/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-param-reassign': 'off',
    },
  },
  {
    files: ['__tests__/**'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];
