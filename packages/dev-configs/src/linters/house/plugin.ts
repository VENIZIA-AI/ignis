import type { ESLint } from 'eslint';
import { HOUSE_PLUGIN_NAMESPACE } from './common';
import { ConstClassValuesRule } from './const-class-values.rule';
import { EffectCleanupConsistencyRule } from './effect-cleanup-consistency.rule';
import { MaxParamsOwnRule } from './max-params-own.rule';
import { NoAsyncHookCallbackRule } from './no-async-hook-callback.rule';
import { NoAwaitNewChainRule } from './no-await-new-chain.rule';
import { NoAwaitPromiseChainRule } from './no-await-promise-chain.rule';
import { NoInlineAwaitRule } from './no-inline-await.rule';
import { NoLeakedRenderRule } from './no-leaked-render.rule';
import { NoNewErrorRule } from './no-new-error.rule';
import { NoParentImportRule } from './no-parent-import.rule';
import { NoReturnAwaitRule } from './no-return-await.rule';
import { NoShadowFrameworkTypeRule } from './no-shadow-framework-type.rule';
import { NoSilentCatchRule } from './no-silent-catch.rule';
import { NoUnbracedCaseRule } from './no-unbraced-case.rule';
import { PreferFrameworkApiRule } from './prefer-framework-api.rule';
import { PreferPromiseSleepRule } from './prefer-promise-sleep.rule';
import { PreferTNullableRule } from './prefer-tnullable.rule';
import { ZodSchemaSuffixRule } from './zod-schema-suffix.rule';

/** The ESLint plugin that carries the house rules oxlint cannot express, registered as `@venizia`. */
export const houseEslintPlugin: ESLint.Plugin = {
  meta: { name: `${HOUSE_PLUGIN_NAMESPACE}/eslint-plugin` },
  rules: {
    'const-class-values': ConstClassValuesRule.RULE,
    'effect-cleanup-consistency': EffectCleanupConsistencyRule.RULE,
    'max-params-own': MaxParamsOwnRule.RULE,
    'no-async-hook-callback': NoAsyncHookCallbackRule.RULE,
    'no-await-new-chain': NoAwaitNewChainRule.RULE,
    'no-await-promise-chain': NoAwaitPromiseChainRule.RULE,
    'no-inline-await': NoInlineAwaitRule.RULE,
    'no-leaked-render': NoLeakedRenderRule.RULE,
    'no-new-error': NoNewErrorRule.RULE,
    'no-parent-import': NoParentImportRule.RULE,
    'no-return-await': NoReturnAwaitRule.RULE,
    'no-shadow-framework-type': NoShadowFrameworkTypeRule.RULE,
    'no-silent-catch': NoSilentCatchRule.RULE,
    'no-unbraced-case': NoUnbracedCaseRule.RULE,
    'prefer-framework-api': PreferFrameworkApiRule.RULE,
    'prefer-promise-sleep': PreferPromiseSleepRule.RULE,
    'prefer-tnullable': PreferTNullableRule.RULE,
    'zod-schema-suffix': ZodSchemaSuffixRule.RULE,
  },
};
