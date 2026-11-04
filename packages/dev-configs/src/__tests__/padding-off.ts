import type { Linter } from 'eslint';
import { LinesBetweenClassMembersRule, PaddingLineBetweenStatementsRule } from '../linters/rules';

/**
 * Switches the padding rules off. The house rule tests compare the exact text a fixer writes, so the blank lines
 * `houseConfigs` would add after the fix are not what they assert.
 */
export const PADDING_OFF: Linter.Config = {
  rules: {
    [PaddingLineBetweenStatementsRule.NAME]: 'off',
    [LinesBetweenClassMembersRule.NAME]: 'off',
  },
};
