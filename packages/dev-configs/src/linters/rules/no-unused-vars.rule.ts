import {
  UnusedArgsModes,
  UnusedVarsScopes,
  type TOxlintRuleEntry,
  type TRuleSeverity,
  type TUnusedArgsMode,
  type TUnusedVarsScope,
} from './common';

/** `no-unused-vars`. Unused arguments pass by default: an override keeps its signature. A `_name` variable is an omitted value (`{ page: _page, ...rest }`) and passes too. */
export class NoUnusedVarsRule {
  static readonly NAME = 'no-unused-vars';

  static build(
    opts: {
      severity?: TRuleSeverity;
      vars?: TUnusedVarsScope;
      args?: TUnusedArgsMode;
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
      vars = UnusedVarsScopes.ALL,
      args = UnusedArgsModes.NONE,
      ignoreRestSiblings = false,
      varsIgnorePattern = '^_',
      ...patterns
    } = opts;
    return [severity, { vars, args, ignoreRestSiblings, varsIgnorePattern, ...patterns }];
  }
}
