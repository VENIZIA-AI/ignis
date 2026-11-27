import {
  UnusedArgsModes,
  UnusedVarsScopes,
  type TRuleSeverity,
  type TUnusedArgsMode,
  type TUnusedVarsScope,
} from './common';

/** `no-unused-vars`. Unused arguments pass: an override keeps its signature. A `_name` variable is an omitted value (`{ page: _page, ...rest }`) and passes too. */
export class NoUnusedVarsRule {
  static readonly NAME = 'no-unused-vars';

  static build(
    opts: {
      /** @default 'error' */
      severity?: TRuleSeverity;
      /** @default 'all' */
      vars?: TUnusedVarsScope;
      /** @default 'none' */
      args?: TUnusedArgsMode;
      /** @default false */
      ignoreRestSiblings?: boolean;
      /** Names that may stay unused, e.g. `^_` - a placeholder a signature needs. */
      argsIgnorePattern?: string;
      /** @default '^_' */
      varsIgnorePattern?: string;
      caughtErrorsIgnorePattern?: string;
      destructuredArrayIgnorePattern?: string;
    } = {},
  ): [
    TRuleSeverity,
    {
      vars: TUnusedVarsScope;
      args: TUnusedArgsMode;
      ignoreRestSiblings: boolean;
      varsIgnorePattern: string;
      argsIgnorePattern?: string;
      caughtErrorsIgnorePattern?: string;
      destructuredArrayIgnorePattern?: string;
    },
  ] {
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
