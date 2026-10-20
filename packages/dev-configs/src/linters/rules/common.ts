import type { OxlintConfig } from 'oxlint';

/** A rule's severity, as both oxlint and ESLint accept it. */
export type TRuleSeverity = 'off' | 'warn' | 'error';

/** The entry oxlint's own types allow for rule `TName`, options included. */
export type TOxlintRuleEntry<TName extends string> = NonNullable<
  NonNullable<OxlintConfig['rules']>[TName]
>;
