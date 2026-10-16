import type { OxlintConfig } from 'oxlint';
import {
  EqeqeqRule,
  NoRestrictedImportsRule,
  NoUnusedVarsRule,
  PreferNullishCoalescingRule,
  SwitchCaseBracesRule,
} from './rules';

/** File globs the rules are scoped to. */
const TS_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
const JS_TS_FILES = ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.jsx', ...TS_FILES];

/**
 * The oxlint port of `eslintConfigs`, generated with `@oxlint/migrate` and kept rule for rule.
 * Type-aware rules (`no-floating-promises`, `return-await`, ...) need `oxlint-tsgolint` installed.
 *
 * Not ported: `@typescript-eslint/naming-convention` (oxlint has no equivalent yet - keep it in
 * ESLint), `@typescript-eslint/prefer-optional-chain` (oxlint nursery), `no-invalid-this` (covered
 * by `noImplicitThis` in `tsconfig.base.json`). `n/prefer-node-protocol` maps to the unicorn rule.
 *
 * ```ts
 * // .configs/oxlint.config.mts
 * import { defineConfig } from 'oxlint';
 * import { oxlintConfigs } from '@venizia/dev-configs/linters';
 *
 * export default defineConfig(oxlintConfigs);
 * ```
 */
export const oxlintConfigs: OxlintConfig = {
  plugins: ['typescript', 'unicorn'],
  categories: { correctness: 'off' },
  options: { typeAware: true },
  env: { builtin: true },
  ignorePatterns: ['**/node_modules/', '**/*.d.ts', '**/build/', '**/dist/', '**/release/'],
  rules: {
    // eslint:recommended
    'constructor-super': 'error',
    'for-direction': 'error',
    'getter-return': 'error',
    'no-async-promise-executor': 'error',
    'no-case-declarations': 'error',
    'no-class-assign': 'error',
    'no-compare-neg-zero': 'error',
    'no-cond-assign': 'error',
    'no-const-assign': 'error',
    'no-constant-binary-expression': 'error',
    'no-constant-condition': 'error',
    'no-control-regex': 'error',
    'no-debugger': 'error',
    'no-delete-var': 'error',
    'no-dupe-else-if': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-empty': 'error',
    'no-empty-character-class': 'error',
    'no-empty-pattern': 'error',
    'no-empty-static-block': 'error',
    'no-ex-assign': 'error',
    'no-extra-boolean-cast': 'error',
    'no-fallthrough': 'error',
    'no-func-assign': 'error',
    'no-global-assign': 'error',
    'no-import-assign': 'error',
    'no-invalid-regexp': 'error',
    'no-irregular-whitespace': 'error',
    'no-loss-of-precision': 'error',
    'no-misleading-character-class': 'error',
    'no-new-native-nonconstructor': 'error',
    'no-nonoctal-decimal-escape': 'error',
    'no-obj-calls': 'error',
    'no-prototype-builtins': 'error',
    'no-regex-spaces': 'error',
    'no-self-assign': 'error',
    'no-setter-return': 'error',
    'no-shadow-restricted-names': 'error',
    'no-sparse-arrays': 'error',
    'no-this-before-super': 'error',
    'no-unassigned-vars': 'error',
    'no-unreachable': 'error',
    'no-unsafe-finally': 'error',
    'no-unsafe-negation': 'error',
    'no-unsafe-optional-chaining': 'error',
    'no-unused-labels': 'error',
    'no-unused-private-class-members': 'error',
    'no-useless-backreference': 'error',
    'no-useless-catch': 'error',
    'no-with': 'error',
    'preserve-caught-error': 'error',
    'require-yield': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error',
    'no-array-constructor': 'error',

    // Strict rules on top
    [NoUnusedVarsRule.NAME]: NoUnusedVarsRule.build(),
    'no-useless-escape': 'warn',
    'no-unused-expressions': 'error',
    'no-new-wrappers': 'error',
    'no-throw-literal': 'error',
    [EqeqeqRule.NAME]: EqeqeqRule.build(),
    'no-void': 'error',
    'no-caller': 'error',
    'no-shadow': 'error',
    'no-use-before-define': 'error',
    [SwitchCaseBracesRule.NAME]: SwitchCaseBracesRule.build(),
    'unicorn/prefer-node-protocol': 'error',

    // typescript-eslint
    'typescript/ban-ts-comment': 'error',
    'typescript/no-duplicate-enum-values': 'error',
    'typescript/no-empty-object-type': 'error',
    'typescript/no-extra-non-null-assertion': 'error',
    'typescript/no-misused-new': 'error',
    'typescript/no-namespace': 'error',
    'typescript/no-non-null-asserted-optional-chain': 'error',
    'typescript/no-this-alias': 'error',
    'typescript/no-unnecessary-type-constraint': 'error',
    'typescript/no-unsafe-declaration-merging': 'error',
    'typescript/no-unsafe-function-type': 'error',
    'typescript/no-wrapper-object-types': 'error',
    'typescript/prefer-as-const': 'error',
    'typescript/prefer-namespace-keyword': 'error',
    'typescript/triple-slash-reference': 'error',
    'typescript/adjacent-overload-signatures': 'error',
    'typescript/prefer-for-of': 'error',
    'typescript/unified-signatures': 'error',

    // typescript-eslint, type-aware
    'typescript/await-thenable': 'error',
    'typescript/no-floating-promises': 'error',
    [PreferNullishCoalescingRule.NAME]: PreferNullishCoalescingRule.build(),
    'typescript/return-await': 'error',
  },
  overrides: [
    {
      // TypeScript itself reports these.
      files: TS_FILES,
      rules: {
        'constructor-super': 'off',
        'getter-return': 'off',
        'no-class-assign': 'off',
        'no-const-assign': 'off',
        'no-dupe-keys': 'off',
        'no-func-assign': 'off',
        'no-import-assign': 'off',
        'no-new-native-nonconstructor': 'off',
        'no-obj-calls': 'off',
        'no-setter-return': 'off',
        'no-this-before-super': 'off',
        'no-unreachable': 'off',
        'no-unsafe-negation': 'off',
        'no-with': 'off',
        'no-var': 'error',
        'prefer-const': 'error',
        'prefer-rest-params': 'error',
        'prefer-spread': 'error',
      },
    },
    {
      files: JS_TS_FILES,
      rules: {
        'no-constant-condition': 'off',
        'prefer-const': 'error',
        'no-var': 'error',
        curly: ['error', 'all'],
        [NoRestrictedImportsRule.NAME]: NoRestrictedImportsRule.build(),
        'typescript/no-unsafe-function-type': 'off',
        'typescript/no-this-alias': 'off',
        'typescript/no-empty-object-type': 'off',
      },
    },
  ],
};
