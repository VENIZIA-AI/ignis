import type { TOxlintRuleEntry, TRuleSeverity } from './common';

/** `no-unused-vars`. Unused arguments pass by default: an override keeps its signature. */
export class NoUnusedVarsRule {
  static readonly NAME = 'no-unused-vars';

  static build(
    opts: {
      severity?: TRuleSeverity;
      vars?: 'all' | 'local';
      args?: 'all' | 'after-used' | 'none';
      ignoreRestSiblings?: boolean;
      /** Names that may stay unused, e.g. `^_` - a placeholder a signature needs. */
      argsIgnorePattern?: string;
      varsIgnorePattern?: string;
      caughtErrorsIgnorePattern?: string;
      destructuredArrayIgnorePattern?: string;
    } = {},
  ): TOxlintRuleEntry<'no-unused-vars'> {
    const {
      severity = 'error',
      vars = 'all',
      args = 'none',
      ignoreRestSiblings = false,
      ...patterns
    } = opts;
    return [severity, { vars, args, ignoreRestSiblings, ...patterns }];
  }
}
