import type { TOxlintRuleEntry, TRuleSeverity } from './common';

/** `typescript/prefer-nullish-coalescing`, type-aware. Options are oxlint's, passed through. */
export class PreferNullishCoalescingRule {
  static readonly NAME = 'typescript/prefer-nullish-coalescing';

  static build(
    opts: {
      severity?: TRuleSeverity;
      ignoreConditionalTests?: boolean;
      ignoreMixedLogicalExpressions?: boolean;
      ignoreTernaryTests?: boolean;
      /** Allow `||` / `||=` where the left side is this primitive, e.g. `{ string: true, number: true }`. */
      ignorePrimitives?: {
        bigint?: boolean;
        boolean?: boolean;
        number?: boolean;
        string?: boolean;
      };
    } = {},
  ): TOxlintRuleEntry<'typescript/prefer-nullish-coalescing'> {
    const { severity = 'error', ...options } = opts;
    return Object.keys(options).length === 0 ? severity : [severity, options];
  }
}
