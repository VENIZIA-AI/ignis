import type { Linter } from 'eslint';
import { namingConventionConfigs } from '../eslint';
import { JSX_FILES } from '../jsx-files';
import { paddingConfigs } from '../padding';
import { reactNamingConventionConfigs } from '../react-eslint';
import { asyncRuleConfigs } from './async-rules';
import { HOUSE_PLUGIN_NAMESPACE } from './common';
import { ConstClassValuesRule } from './const-class-values.rule';
import { EffectCleanupConsistencyRule } from './effect-cleanup-consistency.rule';
import { MaxParamsOwnRule } from './max-params-own.rule';
import { NoAsyncHookCallbackRule } from './no-async-hook-callback.rule';
import { NoLeakedRenderRule } from './no-leaked-render.rule';
import { NoNewErrorRule } from './no-new-error.rule';
import { NoShadowFrameworkTypeRule } from './no-shadow-framework-type.rule';
import { PreferFrameworkApiRule } from './prefer-framework-api.rule';
import { PreferPromiseSleepRule } from './prefer-promise-sleep.rule';
import { PreferTNullableRule } from './prefer-tnullable.rule';
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
      [NoShadowFrameworkTypeRule.NAME]: NoShadowFrameworkTypeRule.build(),
      [PreferTNullableRule.NAME]: PreferTNullableRule.build(),
      [PreferPromiseSleepRule.NAME]: PreferPromiseSleepRule.build(),
      [ConstClassValuesRule.NAME]: ConstClassValuesRule.build({ severity: 'warn' }),
      [NO_CAST_RULE]: ['warn', { assertionStyle: 'never' }],
    },
  },
  {
    files: TEST_FILES,
    rules: {
      [NoNewErrorRule.NAME]: 'off',
      [NoShadowFrameworkTypeRule.NAME]: 'off',
      [PreferPromiseSleepRule.NAME]: 'off',
      [ConstClassValuesRule.NAME]: 'off',
      [NO_CAST_RULE]: 'off',
    },
  },
];

/**
 * The ESLint side of a project that lints with oxlint: the naming convention, the house rules and the async style
 * rules - everything oxlint cannot express. Run it next to `oxlintConfigs`.
 *
 * ```js
 * // .configs/lints/eslint.config.mjs
 * import { houseConfigs } from '@venizia/dev-configs/linters';
 *
 * export default houseConfigs;
 * ```
 */
export const houseConfigs: Linter.Config[] = [
  ...namingConventionConfigs,
  ...houseRuleConfigs,
  ...asyncRuleConfigs,
  ...paddingConfigs,
];

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

/**
 * The hook rules: a hook never gets an async function (`no-async-hook-callback`), and an effect callback returns a
 * cleanup on every path or on none (`effect-cleanup-consistency`), and `prefer-framework-api` (a browser API ardor-react wraps
 * in a hook is used through the hook). Hooks live in `.ts` files too, so it covers all
 * source files.
 */
const reactHookRuleConfigs: Linter.Config[] = [
  {
    files: SOURCE_FILES,
    plugins: { [HOUSE_PLUGIN_NAMESPACE]: houseEslintPlugin },
    rules: {
      [NoAsyncHookCallbackRule.NAME]: NoAsyncHookCallbackRule.build(),
      [EffectCleanupConsistencyRule.NAME]: EffectCleanupConsistencyRule.build(),
    },
  },
  // A hook or a util in a `.ts` file reaches the browser as well as a component does; a test stubs the browser on purpose.
  {
    files: SOURCE_FILES,
    plugins: { [HOUSE_PLUGIN_NAMESPACE]: houseEslintPlugin },
    rules: { [PreferFrameworkApiRule.NAME]: PreferFrameworkApiRule.build() },
  },
  { files: TEST_FILES, rules: { [PreferFrameworkApiRule.NAME]: 'off' } },
];

/** `houseConfigs` for a React project: `reactNamingConventionConfigs`, the house rules, the async style rules, `no-leaked-render` and the hook rules. */
export const reactHouseConfigs: Linter.Config[] = [
  ...reactNamingConventionConfigs,
  ...houseRuleConfigs,
  ...asyncRuleConfigs,
  ...paddingConfigs,
  ...reactRuleConfigs,
  ...reactHookRuleConfigs,
];
