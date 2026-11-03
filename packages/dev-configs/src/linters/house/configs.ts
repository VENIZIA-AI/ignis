import type { Linter } from 'eslint';
import { namingConventionConfigs } from '../eslint';
import { JSX_FILES } from '../jsx-files';
import { reactNamingConventionConfigs } from '../react-eslint';
import { HOUSE_PLUGIN_NAMESPACE } from './common';
import { ConstClassValuesRule } from './const-class-values.rule';
import { EffectCleanupConsistencyRule } from './effect-cleanup-consistency.rule';
import { MaxParamsOwnRule } from './max-params-own.rule';
import { NoAsyncHookCallbackRule } from './no-async-hook-callback.rule';
import { NoAwaitPromiseChainRule } from './no-await-promise-chain.rule';
import { NoInlineAwaitRule } from './no-inline-await.rule';
import { NoLeakedRenderRule } from './no-leaked-render.rule';
import { NoNewErrorRule } from './no-new-error.rule';
import { NoReturnAwaitRule } from './no-return-await.rule';
import { NoSilentCatchRule } from './no-silent-catch.rule';
import { houseEslintPlugin } from './plugin';

const SOURCE_FILES = ['**/*.{ts,tsx,mts,cts}'];
const TEST_FILES = ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'];

/**
 * V-C-10: no explicit cast. `as const` is always allowed; `satisfies`, a generic or a narrower type
 * replaces the rest.
 */
const NO_CAST_RULE = '@typescript-eslint/consistent-type-assertions';

/**
 * The house rules: at most 5 positional parameters on a function we write, and errors thrown through
 * `getError` only. Tests are exempt from `no-new-error`: a test throws a plain `Error` on purpose, to
 * stand in for what a driver or a third-party library throws.
 *
 * Two rules only warn, so a project adopts them without failing its lint: `const-class-values` (V-C-08, a
 * string-literal union in an exported declaration) and `consistent-type-assertions` (V-C-10, an `as X`
 * cast). Tests are exempt from both: a test stubs what it does not build.
 */
const houseRuleConfigs: Linter.Config[] = [
  {
    files: SOURCE_FILES,
    plugins: { [HOUSE_PLUGIN_NAMESPACE]: houseEslintPlugin },
    rules: {
      [MaxParamsOwnRule.NAME]: MaxParamsOwnRule.build(),
      [NoNewErrorRule.NAME]: NoNewErrorRule.build(),
      [ConstClassValuesRule.NAME]: ConstClassValuesRule.build({ severity: 'warn' }),
      [NO_CAST_RULE]: ['warn', { assertionStyle: 'never' }],
    },
  },
  {
    files: TEST_FILES,
    rules: {
      [NoNewErrorRule.NAME]: 'off',
      [ConstClassValuesRule.NAME]: 'off',
      [NO_CAST_RULE]: 'off',
    },
  },
];

/**
 * The ESLint side of a project that lints with oxlint: the naming convention plus the house rules -
 * everything oxlint cannot express. Run it next to `oxlintConfigs`.
 *
 * ```js
 * // .configs/lints/eslint.config.mjs
 * import { houseConfigs } from '@venizia/dev-configs/linters';
 *
 * export default houseConfigs;
 * ```
 */
export const houseConfigs: Linter.Config[] = [...namingConventionConfigs, ...houseRuleConfigs];

/**
 * The React house rule: a JSX child is drawn with `cond ? <X /> : null`, never `cond && <X />`, which
 * draws `0` when `cond` is `0`.
 */
const reactRuleConfigs: Linter.Config[] = [
  {
    files: JSX_FILES,
    plugins: { [HOUSE_PLUGIN_NAMESPACE]: houseEslintPlugin },
    rules: { [NoLeakedRenderRule.NAME]: NoLeakedRenderRule.build() },
  },
];

/** `houseConfigs` for a React project: `reactNamingConventionConfigs`, the house rules and `no-leaked-render`. */
export const reactHouseConfigs: Linter.Config[] = [
  ...reactNamingConventionConfigs,
  ...houseRuleConfigs,
  ...reactRuleConfigs,
];

/**
 * The async style rules, opt-in until every Venizia repository has been swept (the owner's rollout: the option in
 * one release, the default in the next). Spread it next to `houseConfigs`:
 *
 * ```js
 * export default [...houseConfigs, ...asyncStyleConfigs];
 * ```
 *
 * `await` stands alone as a statement or as the whole initializer of a declaration (`no-inline-await`), a
 * function returns the promise instead of `return await` (`no-return-await`), an `await` never takes a promise
 * chain (`no-await-promise-chain`), and a caught error leaves a trace (`no-silent-catch`). They apply to test
 * files too.
 */
export const asyncStyleConfigs: Linter.Config[] = [
  {
    files: SOURCE_FILES,
    plugins: { [HOUSE_PLUGIN_NAMESPACE]: houseEslintPlugin },
    rules: {
      [NoInlineAwaitRule.NAME]: NoInlineAwaitRule.build(),
      [NoReturnAwaitRule.NAME]: NoReturnAwaitRule.build(),
      [NoAwaitPromiseChainRule.NAME]: NoAwaitPromiseChainRule.build(),
      [NoSilentCatchRule.NAME]: NoSilentCatchRule.build(),
    },
  },
];

/**
 * The hook async rules, opt-in like `asyncStyleConfigs`. Spread it next to `reactHouseConfigs`:
 *
 * ```js
 * export default [...reactHouseConfigs, ...reactAsyncStyleConfigs];
 * ```
 *
 * A hook never gets an async function (`no-async-hook-callback`), and an effect callback returns a cleanup on every
 * path or on none (`effect-cleanup-consistency`). Hooks live in `.ts` files too, so it covers all source files.
 * It also carries `no-await-promise-chain` and `no-silent-catch`: a hook body is where a promise chain lives.
 */
export const reactAsyncStyleConfigs: Linter.Config[] = [
  {
    files: SOURCE_FILES,
    plugins: { [HOUSE_PLUGIN_NAMESPACE]: houseEslintPlugin },
    rules: {
      [NoAsyncHookCallbackRule.NAME]: NoAsyncHookCallbackRule.build(),
      [EffectCleanupConsistencyRule.NAME]: EffectCleanupConsistencyRule.build(),
      [NoAwaitPromiseChainRule.NAME]: NoAwaitPromiseChainRule.build(),
      [NoSilentCatchRule.NAME]: NoSilentCatchRule.build(),
    },
  },
];
