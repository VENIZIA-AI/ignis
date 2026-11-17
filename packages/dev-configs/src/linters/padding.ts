import stylistic from '@stylistic/eslint-plugin';
import type { Linter } from 'eslint';
import { LinesBetweenClassMembersRule, PaddingLineBetweenStatementsRule } from './rules';

const SOURCE_FILES = ['**/*.{ts,tsx,mts,cts}'];

/**
 * The blank-line padding rules: after imports, before a `return`, between class members, around block-like statements.
 * ESLint-only: oxlint has none of the four rules.
 * They need the TypeScript parser of `namingConventionConfigs` or `eslintConfigs`.
 */
export const paddingConfigs: Linter.Config[] = [
  {
    files: SOURCE_FILES,
    plugins: { '@stylistic': stylistic },
    rules: {
      [PaddingLineBetweenStatementsRule.NAME]: PaddingLineBetweenStatementsRule.build(),
      [LinesBetweenClassMembersRule.NAME]: LinesBetweenClassMembersRule.build(),
    },
  },
];
