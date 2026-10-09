// The lint is for defects, not style (decided 2026-10-09; story
// lint-and-hooks-guard-every-change). typescript-eslint's type-checked rules
// read the real types, which is what finds a promise nobody awaits: the class
// of the activation hangs this extension has had.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '*.vsix'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // node:test's test() returns a promise the runner awaits itself; every
      // test file would otherwise be 340 findings of nothing.
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'describe', 'it', 'suite'] }],
      }],
    },
  },
  {
    // Plain JavaScript run by Node in the image (core/bin): no types to read.
    files: ['**/*.mjs', '**/*.js', '**/*.cjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
)
