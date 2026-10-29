import type { ESLint } from 'eslint';
import { HOUSE_PLUGIN_NAMESPACE } from './common';
import { ConstClassValuesRule } from './const-class-values.rule';
import { EffectCleanupConsistencyRule } from './effect-cleanup-consistency.rule';
import { MaxParamsOwnRule } from './max-params-own.rule';
import { NoAsyncHookCallbackRule } from './no-async-hook-callback.rule';
import { NoInlineAwaitRule } from './no-inline-await.rule';
import { NoLeakedRenderRule } from './no-leaked-render.rule';
import { NoNewErrorRule } from './no-new-error.rule';
import { NoReturnAwaitRule } from './no-return-await.rule';

/** The ESLint plugin that carries the house rules oxlint cannot express, registered as `venizia`. */
export const houseEslintPlugin: ESLint.Plugin = {
  meta: { name: `eslint-plugin-${HOUSE_PLUGIN_NAMESPACE}` },
  rules: {
    'const-class-values': ConstClassValuesRule.RULE,
    'effect-cleanup-consistency': EffectCleanupConsistencyRule.RULE,
    'max-params-own': MaxParamsOwnRule.RULE,
    'no-async-hook-callback': NoAsyncHookCallbackRule.RULE,
    'no-inline-await': NoInlineAwaitRule.RULE,
    'no-leaked-render': NoLeakedRenderRule.RULE,
    'no-new-error': NoNewErrorRule.RULE,
    'no-return-await': NoReturnAwaitRule.RULE,
  },
};
