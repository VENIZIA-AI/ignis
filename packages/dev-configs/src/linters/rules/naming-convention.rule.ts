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
    // A type alias starts with `T` or ends with `Type`; an interface starts with `I`.
    {
      selector: 'typeAlias',
      format: ['PascalCase'],
      custom: { regex: '^T[A-Z0-9]|Type$', match: true },
    },
    { selector: 'interface', format: ['PascalCase'], prefix: ['I'] },
    // Names that stay as they are: the framework's value helpers, and a type that shares its name with a class value.
    {
      selector: 'typeAlias',
      filter: {
        regex: '^(ValueOf|ValueOptional|ValueOptionalExcept|ValueOrPromise|PGliteCRUDRepository)$',
        match: true,
      },
      format: null,
    },
    // Interfaces that `declare module` or `declare global` adds to: the name belongs to the library, and the rule
    // cannot see where an interface is declared.
    {
      selector: 'interface',
      filter: {
        regex:
          '^(ContextRenderer|ContextVariableMap|ImportMeta|ImportMetaEnv|Matchers|ProcessEnv|Register|Window)$',
        match: true,
      },
      format: null,
    },
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

  /**
   * `extraSelectors` are appended, but position decides nothing: typescript-eslint orders selectors by how specific
   * they are. To let a name through the base type selectors, give a selector a `filter` and `format: null`.
   */
  static build(
    opts: { severity?: TRuleSeverity; extraSelectors?: TNamingSelector[] } = {},
  ): Linter.RuleEntry {
    const { severity = 'error', extraSelectors = [] } = opts;

    return [severity, ...NamingConventionRule.SELECTORS, ...extraSelectors];
  }
}
