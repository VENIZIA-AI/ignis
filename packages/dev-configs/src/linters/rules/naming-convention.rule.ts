import type { Linter } from 'eslint';
import type { TRuleSeverity } from './common';

/** One selector of `@typescript-eslint/naming-convention`, as its documentation types it. */
export type TNamingSelector = Record<string, unknown> & { selector: string | string[] };

/**
 * `@typescript-eslint/naming-convention`, owned here. oxlint has no port of it, so it runs in ESLint.
 * The selectors are the LoopBack 4 set the base preset carried, kept one for one.
 */
export class NamingConventionRule {
  static readonly NAME = '@typescript-eslint/naming-convention';

  static readonly SELECTORS: readonly TNamingSelector[] = [
    { selector: 'default', format: ['camelCase'] },
    { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
    { selector: 'variable', format: null, filter: '^_$' },
    // A `_name` variable names an omitted value (`{ page: _page, ...rest }`); its case is still checked.
    {
      selector: 'variable',
      filter: { regex: '^_.', match: true },
      format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
      leadingUnderscore: 'allow',
    },
    { selector: 'function', format: ['PascalCase'], filter: 'Mixin$' },
    { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
    {
      selector: 'enumMember',
      format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
      leadingUnderscore: 'allow',
    },
    {
      selector: 'property',
      format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
      leadingUnderscore: 'allow',
    },
    { selector: 'method', format: ['camelCase'], leadingUnderscore: 'allow' },
    { selector: 'memberLike', modifiers: ['static'], format: ['camelCase', 'UPPER_CASE'] },
    {
      selector: 'memberLike',
      modifiers: ['private'],
      format: ['camelCase'],
      leadingUnderscore: 'allow',
    },
    {
      selector: 'memberLike',
      modifiers: ['protected'],
      format: ['camelCase'],
      leadingUnderscore: 'allow',
    },
    { selector: 'typeLike', format: ['PascalCase'] },
    {
      selector: [
        'objectLiteralProperty',
        'objectLiteralMethod',
        'typeProperty',
        'typeMethod',
        'classProperty',
        'classMethod',
        'enumMember',
      ],
      format: null,
      modifiers: ['requiresQuotes'],
    },
    { selector: 'import', format: ['camelCase', 'PascalCase'] },
    { selector: 'import', format: null, filter: '^_$' },
  ];

  /** `extraSelectors` go last, so they win over a base selector they overlap. */
  static build(
    opts: { severity?: TRuleSeverity; extraSelectors?: TNamingSelector[] } = {},
  ): Linter.RuleEntry {
    const { severity = 'error', extraSelectors = [] } = opts;
    return [severity, ...NamingConventionRule.SELECTORS, ...extraSelectors];
  }
}
