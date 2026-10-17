import type { ESLint } from 'eslint';
import { HOUSE_PLUGIN_NAMESPACE } from './common';
import { MaxParamsOwnRule } from './max-params-own.rule';
import { NoNewErrorRule } from './no-new-error.rule';

/** The ESLint plugin that carries the house rules oxlint cannot express, registered as `venizia`. */
export const houseEslintPlugin: ESLint.Plugin = {
  meta: { name: `eslint-plugin-${HOUSE_PLUGIN_NAMESPACE}` },
  rules: {
    'max-params-own': MaxParamsOwnRule.RULE,
    'no-new-error': NoNewErrorRule.RULE,
  },
};
