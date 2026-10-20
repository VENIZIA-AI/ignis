import type { TOxlintRuleEntry, TRuleSeverity } from './common';

/** One forbidden import path, with the message the author sees. */
export interface IRestrictedImportPath {
  name: string;
  message: string;
  importNames?: string[];
}

/** `no-restricted-imports`. The base forbids the whole of lodash, which defeats tree-shaking. */
export class NoRestrictedImportsRule {
  static readonly NAME = 'no-restricted-imports';

  static readonly PATHS: readonly IRestrictedImportPath[] = [
    {
      name: 'lodash',
      message:
        "Please import 'fn' from 'lodash/fn' instead of * from lodash | Ex: import get from 'lodash/get'",
    },
  ];

  static build(
    opts: { severity?: TRuleSeverity; extraPaths?: IRestrictedImportPath[] } = {},
  ): TOxlintRuleEntry<'no-restricted-imports'> {
    const { severity = 'error', extraPaths = [] } = opts;
    return [severity, { paths: [...NoRestrictedImportsRule.PATHS, ...extraPaths] }];
  }
}
