import type { Linter } from 'eslint';
import { namingConventionConfigs } from '../eslint';
import { JSX_FILES } from '../jsx-files';
import { reactNamingConventionConfigs } from '../react-eslint';
import { HOUSE_PLUGIN_NAMESPACE } from './common';
import { MaxParamsOwnRule } from './max-params-own.rule';
import { NoLeakedRenderRule } from './no-leaked-render.rule';
import { NoNewErrorRule } from './no-new-error.rule';
import { houseEslintPlugin } from './plugin';

const SOURCE_FILES = ['**/*.{ts,tsx,mts,cts}'];
const TEST_FILES = ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'];

/**
 * The house rules: at most 5 positional parameters on a function we write, and errors thrown through
 * `getError` only. Tests are exempt from `no-new-error`: a test throws a plain `Error` on purpose, to
 * stand in for what a driver or a third-party library throws.
 */
const houseRuleConfigs: Linter.Config[] = [
  {
    files: SOURCE_FILES,
    plugins: { [HOUSE_PLUGIN_NAMESPACE]: houseEslintPlugin },
    rules: {
      [MaxParamsOwnRule.NAME]: MaxParamsOwnRule.build(),
      [NoNewErrorRule.NAME]: NoNewErrorRule.build(),
    },
  },
  { files: TEST_FILES, rules: { [NoNewErrorRule.NAME]: 'off' } },
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
