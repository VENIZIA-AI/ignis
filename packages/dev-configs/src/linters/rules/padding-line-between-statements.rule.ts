import type { RuleOptions } from '@stylistic/eslint-plugin/rule-options';
import type { Linter } from 'eslint';
import type { TRuleSeverity } from './common';

/**
 * `@stylistic/padding-line-between-statements`: blank lines after imports, before a `return` and around block-likes.
 * oxlint has no port of it, so it runs in ESLint.
 * Stacked `case` labels stay together, or `no-fallthrough` reads the empty one as a fall-through.
 */
export class PaddingLineBetweenStatementsRule {
  static readonly NAME = '@stylistic/padding-line-between-statements';

  static readonly PADDINGS: RuleOptions[typeof PaddingLineBetweenStatementsRule.NAME] = [
    { blankLine: 'always', prev: 'import', next: '*' },
    { blankLine: 'any', prev: 'import', next: 'import' },
    { blankLine: 'always', prev: '*', next: 'return' },
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: '*', next: 'block-like' },
    { blankLine: 'any', prev: ['case', 'default'], next: ['case', 'default'] },
  ];

  static build(opts: { severity?: TRuleSeverity } = {}): Linter.RuleEntry {
    const { severity = 'error' } = opts;

    return [severity, ...PaddingLineBetweenStatementsRule.PADDINGS];
  }
}
