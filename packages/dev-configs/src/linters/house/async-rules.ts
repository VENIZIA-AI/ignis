import type { Linter } from 'eslint';
import { HOUSE_PLUGIN_NAMESPACE } from './common';
import { NoAwaitPromiseChainRule } from './no-await-promise-chain.rule';
import { NoInlineAwaitRule } from './no-inline-await.rule';
import { NoReturnAwaitRule } from './no-return-await.rule';
import { NoSilentCatchRule } from './no-silent-catch.rule';
import { houseEslintPlugin } from './plugin';

/**
 * The async style rules: `await` stands alone as a statement or as the whole initializer of a declaration
 * (`no-inline-await`), a function returns the promise instead of `return await` (`no-return-await`), an `await`
 * never takes a promise chain (`no-await-promise-chain`), and a caught error leaves a trace (`no-silent-catch`).
 * They apply to test files too. Not exported from the package: `houseConfigs` and `reactHouseConfigs` carry them, and
 * `devz codemod async-style` runs them alone.
 */
export const asyncRuleConfigs: Linter.Config[] = [
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    plugins: { [HOUSE_PLUGIN_NAMESPACE]: houseEslintPlugin },
    rules: {
      [NoInlineAwaitRule.NAME]: NoInlineAwaitRule.build(),
      [NoReturnAwaitRule.NAME]: NoReturnAwaitRule.build(),
      [NoAwaitPromiseChainRule.NAME]: NoAwaitPromiseChainRule.build(),
      [NoSilentCatchRule.NAME]: NoSilentCatchRule.build(),
    },
  },
];
