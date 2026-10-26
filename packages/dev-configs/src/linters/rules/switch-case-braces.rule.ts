import {
  SwitchCaseBracesModes,
  type TOxlintRuleEntry,
  type TRuleSeverity,
  type TSwitchCaseBracesMode,
} from './common';

/** `unicorn/switch-case-braces`. `always` gives every case its own block scope. */
export class SwitchCaseBracesRule {
  static readonly NAME = 'unicorn/switch-case-braces';

  static build(
    opts: { severity?: TRuleSeverity; mode?: TSwitchCaseBracesMode } = {},
  ): TOxlintRuleEntry<'unicorn/switch-case-braces'> {
    const { severity = 'error', mode = SwitchCaseBracesModes.ALWAYS } = opts;
    return [severity, mode];
  }
}
