import type { TOxlintRuleEntry, TRuleSeverity } from './common';

/** `eqeqeq`. `smart` still allows `== null` and comparing two literals. */
export class EqeqeqRule {
  static readonly NAME = 'eqeqeq';

  static build(
    opts: { severity?: TRuleSeverity; mode?: 'always' | 'smart' } = {},
  ): TOxlintRuleEntry<'eqeqeq'> {
    const { severity = 'error', mode = 'smart' } = opts;
    return [severity, mode];
  }
}
