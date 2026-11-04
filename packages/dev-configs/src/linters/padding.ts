import stylistic from '@stylistic/eslint-plugin';
import type { Linter } from 'eslint';
import { LinesBetweenClassMembersRule, PaddingLineBetweenStatementsRule } from './rules';

const SOURCE_FILES = ['**/*.{ts,tsx,mts,cts}'];

/**
 * The blank-line padding rules: after the import block, before a `return`, between class members, and around every
 * block-like statement. All autofixable (`devz lint --fix`). They are ESLint-only: oxlint 1.89 has none of the four
 * rules, so a project that lints with oxlint alone gets nothing until oxlint ports them.
 *
 * The configs carry the rules and the `@stylistic` plugin, not a parser; they ride on the TypeScript parser of
 * `namingConventionConfigs` or `eslintConfigs`, which `houseConfigs`, `reactHouseConfigs` and `eslintConfigs` already
 * include. Spread them on their own only next to one of those.
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
