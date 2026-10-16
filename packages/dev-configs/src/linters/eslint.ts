import mtLinterConfs from '@minimaltech/eslint-node';
import type { Linter } from 'eslint';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';
import { NamingConventionRule, SwitchCaseBracesRule } from './rules';

/** The full ESLint preset. A project on oxlint uses `oxlintConfigs` + `namingConventionConfigs`. */
export const eslintConfigs: Linter.Config[] = [
  ...mtLinterConfs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-namespace': 'error',
    },
  },
  {
    plugins: { unicorn },
    rules: {
      [SwitchCaseBracesRule.NAME]: SwitchCaseBracesRule.build() as Linter.RuleEntry,
    },
  },
  {
    // Owned here, no longer read from the base preset: the same selectors, kept one for one.
    rules: { [NamingConventionRule.NAME]: NamingConventionRule.build() },
  },
];

/**
 * The one rule of `eslintConfigs` that oxlint cannot run yet, as a standalone ESLint preset to run
 * next to `oxlintConfigs`. It needs no type information, so ESLint stays fast.
 *
 * ```js
 * // .configs/eslint.config.mts
 * import { namingConventionConfigs } from '@venizia/dev-configs/linters';
 *
 * export default namingConventionConfigs;
 * ```
 */
export const namingConventionConfigs: Linter.Config[] = [
  // Global: ESLint does not read .gitignore, and still walks plain .js files no config claims.
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/*.d.ts', '**/*.{js,cjs,mjs}'] },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: { parser: tseslint.parser as Linter.Parser },
    plugins: { '@typescript-eslint': tseslint.plugin as never },
    // oxlint owns every other rule, so the disable comments for them are not ESLint's to judge.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { [NamingConventionRule.NAME]: NamingConventionRule.build() },
  },
];
