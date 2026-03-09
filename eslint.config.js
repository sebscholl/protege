import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'site/.vitepress/cache/**', 'clone-local/**']
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }]
    }
  },
  {
    files: ['extensions/**/*.ts', 'demo/extensions/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@engine/*', '@extensions/*', '@configs/*', '@memory/*', '@relay/*'],
              message: 'Extension code must import only from @protege-pack/toolkit for framework APIs.'
            }
          ]
        }
      ]
    }
  }
];
