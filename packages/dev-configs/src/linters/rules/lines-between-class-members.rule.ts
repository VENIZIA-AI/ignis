import type { Linter } from 'eslint';
import type { TRuleSeverity } from './common';

/**
 * `@stylistic/lines-between-class-members`. A blank line between class members, except after a one-line member, so
 * a run of one-line properties stays together. Overload signatures stay together too (the rule's default). oxlint
 * has no port of it, so it runs in ESLint.
 */
export class LinesBetweenClassMembersRule {
  static readonly NAME = '@stylistic/lines-between-class-members';

  static build(opts: { severity?: TRuleSeverity } = {}): Linter.RuleEntry {
    const { severity = 'error' } = opts;

    return [severity, 'always', { exceptAfterSingleLine: true }];
  }
}
