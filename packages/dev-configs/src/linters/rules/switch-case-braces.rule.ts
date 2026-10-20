import type { TOxlintRuleEntry, TRuleSeverity } from './common';

/** `unicorn/switch-case-braces`. `always` gives every case its own block scope. */
export class SwitchCaseBracesRule {
  static readonly NAME = 'unicorn/switch-case-braces';

  static build(
    opts: { severity?: TRuleSeverity; mode?: 'always' | 'avoid' } = {},
  ): TOxlintRuleEntry<'unicorn/switch-case-braces'> {
    const { severity = 'error', mode = 'always' } = opts;
    return [severity, mode];
  }
}
