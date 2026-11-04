import type { Linter } from 'eslint';
import type { TRuleSeverity } from './common';

/**
 * `@stylistic/padding-line-between-statements`, the blank-line padding of a statement list. oxlint has no port of
 * it, so it runs in ESLint, next to the other rules oxlint cannot express.
 *
 * The paddings are read in order and the last match wins, so the import pair follows "after an import":
 *
 * - a blank line after the import block, none required between two imports;
 * - a blank line before a `return` that follows other statements;
 * - a blank line after every block-like statement (`if`, `for`, `while`, `do`, `switch`, `try` and a bare block,
 *   and a declaration whose value ends in a block, such as `const f = () => { ... }`) when another statement
 *   follows, and before one that follows other statements.
 *
 * - between `case` and `default` clauses the padding is left as written: stacked labels (`case 'a':` over
 *   `case 'b': {`) must stay together, or `no-fallthrough` reads the empty one as a fall-through.
 *
 * An `else` or `catch` chain is one statement, so the padding never splits it.
 */
export class PaddingLineBetweenStatementsRule {
  static readonly NAME = '@stylistic/padding-line-between-statements';

  static readonly PADDINGS = [
    { blankLine: 'always', prev: 'import', next: '*' },
    { blankLine: 'any', prev: 'import', next: 'import' },
    { blankLine: 'always', prev: '*', next: 'return' },
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: '*', next: 'block-like' },
    { blankLine: 'any', prev: ['case', 'default'], next: ['case', 'default'] },
  ] as const;

  static build(opts: { severity?: TRuleSeverity } = {}): Linter.RuleEntry {
    const { severity = 'error' } = opts;

    return [severity, ...PaddingLineBetweenStatementsRule.PADDINGS];
  }
}
