import { EqeqeqModes, type TEqeqeqMode, type TOxlintRuleEntry, type TRuleSeverity } from './common';

/** `eqeqeq`. `smart` still allows `== null` and comparing two literals. */
export class EqeqeqRule {
  static readonly NAME = 'eqeqeq';

  static build(
    opts: { severity?: TRuleSeverity; mode?: TEqeqeqMode } = {},
  ): TOxlintRuleEntry<'eqeqeq'> {
    const { severity = 'error', mode = EqeqeqModes.SMART } = opts;
    return [severity, mode];
  }
}
