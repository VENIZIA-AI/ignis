import js from '@eslint/js';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import n from 'eslint-plugin-n';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';
import {
  NamingConventionRule,
  NoRestrictedImportsRule,
  NoUnusedVarsRule,
  SwitchCaseBracesRule,
} from './rules';

/** Every file the preset lints. */
const SOURCE_FILES = [
  '**/*.js',
  '**/*.cjs',
  '**/*.mjs',
  '**/*.jsx',
  '**/*.ts',
  '**/*.cts',
  '**/*.mts',
  '**/*.tsx',
];

/** Rules that stay off: the type checker, the formatter or the framework's own style covers them. */
const OFF_RULES: Linter.RulesRecord = {
  'no-constant-condition': 'off',
  'no-undef': 'off',
  'no-unused-vars': 'off',
  'no-mixed-operators': 'off',
  'no-inner-declarations': 'off',
  'no-dupe-class-members': 'off',
  'no-redeclare': 'off',
  'no-invalid-this': 'off',
  'no-shadow': 'off',
  'no-return-await': 'off',
  camelcase: 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unsafe-function-type': 'off',
  '@typescript-eslint/no-this-alias': 'off',
  '@typescript-eslint/no-empty-object-type': 'off',
  '@typescript-eslint/no-invalid-void-type': 'off',
  '@typescript-eslint/no-confusing-void-expression': 'off',
  '@typescript-eslint/no-extraneous-class': 'off',
  '@typescript-eslint/no-require-imports': 'off',
  '@typescript-eslint/strict-boolean-expressions': 'off',
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-member-accessibility': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/array-type': 'off',
  '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/no-empty-function': 'off',
  '@typescript-eslint/consistent-type-assertions': 'off',
  '@typescript-eslint/no-misused-promises': 'off',
};

/** The LoopBack 4 rule set, on top of the recommended presets. */
const STRICT_RULES: Linter.RulesRecord = {
  'prefer-const': 'error',
  'no-var': 'error',
  curly: ['error', 'all'],
  'no-new-wrappers': 'error',
  'no-throw-literal': 'error',
  'no-unused-expressions': 'error',
  eqeqeq: ['error', 'smart'],
  'no-void': 'error',
  'no-useless-escape': 'warn',
  'no-caller': 'error',
  'n/prefer-node-protocol': ['error'],
  '@typescript-eslint/adjacent-overload-signatures': 'error',
  '@typescript-eslint/prefer-for-of': 'error',
  '@typescript-eslint/unified-signatures': 'error',
  '@typescript-eslint/no-invalid-this': ['error'],
  '@typescript-eslint/no-use-before-define': 'error',
  '@typescript-eslint/no-shadow': 'error',
  '@typescript-eslint/ban-ts-comment': 'error',
  '@typescript-eslint/no-namespace': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/prefer-optional-chain': 'error',
  '@typescript-eslint/prefer-nullish-coalescing': [
    'error',
    { allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing: true },
  ],
  '@typescript-eslint/return-await': 'error',
};

/**
 * The full ESLint preset, owned here: the LoopBack 4 rule set on the ESLint, typescript-eslint and
 * Prettier recommended presets, type-aware through the project service. A project on oxlint uses
 * `oxlintConfigs` + `namingConventionConfigs` instead.
 */
export const eslintConfigs: Linter.Config[] = defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  // Last of the presets, so it turns off every stylistic rule that would fight the formatter.
  prettierRecommended,
  {
    files: SOURCE_FILES,
    languageOptions: {
      parserOptions: {
        // Finds each file's tsconfig; the default project covers root-level scripts and configs.
        projectService: { allowDefaultProject: ['*.js', '*.cjs', '*.mjs', '.*.js'] },
      },
    },
    plugins: { n, unicorn },
    rules: {
      ...OFF_RULES,
      ...STRICT_RULES,
      '@typescript-eslint/no-unused-vars': NoUnusedVarsRule.build() as Linter.RuleEntry,
      [NoRestrictedImportsRule.NAME]: NoRestrictedImportsRule.build() as Linter.RuleEntry,
      [SwitchCaseBracesRule.NAME]: SwitchCaseBracesRule.build() as Linter.RuleEntry,
      [NamingConventionRule.NAME]: NamingConventionRule.build(),
    },
  },
  {
    ignores: [
      '**/node_modules/',
      '**/*.d.ts',
      '**/build/',
      '**/dist/',
      '**/release/',
      '**/babel.config.*',
      '**/.babelrc.*',
      '**/eslint.config.*',
      '**/.eslintrc.*',
      '**/.prettierrc.*',
    ],
  },
]);

/**
 * The one rule of `eslintConfigs` that oxlint cannot run yet, as a standalone ESLint preset to run
 * next to `oxlintConfigs`. It needs no type information, so ESLint stays fast.
 *
 * ```js
 * // .configs/eslint.config.mjs
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
