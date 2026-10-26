import type { OxlintConfig } from 'oxlint';

/** The string values of a const class: its static members that are strings, as literal types. */
export type TConstValue<T> = Extract<T[keyof T], string> & {};

/** A rule's severity, as both oxlint and ESLint accept it. */
export class RuleSeverities {
  static readonly OFF = 'off';
  static readonly WARN = 'warn';
  static readonly ERROR = 'error';

  static readonly SCHEME_SET = new Set<string>([this.OFF, this.WARN, this.ERROR]);

  static isValid(value: string): value is TRuleSeverity {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid rule severity values. */
export type TRuleSeverity = TConstValue<typeof RuleSeverities>;

/** `eqeqeq` modes: ALWAYS wants `===` everywhere, SMART still allows `== null` and comparing two literals. */
export class EqeqeqModes {
  static readonly ALWAYS = 'always';
  static readonly SMART = 'smart';

  static readonly SCHEME_SET = new Set<string>([this.ALWAYS, this.SMART]);

  static isValid(value: string): value is TEqeqeqMode {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid eqeqeq mode values. */
export type TEqeqeqMode = TConstValue<typeof EqeqeqModes>;

/** `no-unused-vars` `vars`: ALL checks globals too, LOCAL only the variables of the file. */
export class UnusedVarsScopes {
  static readonly ALL = 'all';
  static readonly LOCAL = 'local';

  static readonly SCHEME_SET = new Set<string>([this.ALL, this.LOCAL]);

  static isValid(value: string): value is TUnusedVarsScope {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid unused vars scope values. */
export type TUnusedVarsScope = TConstValue<typeof UnusedVarsScopes>;

/** `no-unused-vars` `args`: ALL checks every argument, AFTER_USED those after the last used one, NONE no argument. */
export class UnusedArgsModes {
  static readonly ALL = 'all';
  static readonly AFTER_USED = 'after-used';
  static readonly NONE = 'none';

  static readonly SCHEME_SET = new Set<string>([this.ALL, this.AFTER_USED, this.NONE]);

  static isValid(value: string): value is TUnusedArgsMode {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid unused args mode values. */
export type TUnusedArgsMode = TConstValue<typeof UnusedArgsModes>;

/** `switch-case-braces` modes: ALWAYS gives every case its own block, AVOID drops braces that hold nothing that needs a scope. */
export class SwitchCaseBracesModes {
  static readonly ALWAYS = 'always';
  static readonly AVOID = 'avoid';

  static readonly SCHEME_SET = new Set<string>([this.ALWAYS, this.AVOID]);

  static isValid(value: string): value is TSwitchCaseBracesMode {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid switch case braces mode values. */
export type TSwitchCaseBracesMode = TConstValue<typeof SwitchCaseBracesModes>;

/** The entry oxlint's own types allow for rule `TName`, options included. */
export type TOxlintRuleEntry<TName extends string> = NonNullable<
  NonNullable<OxlintConfig['rules']>[TName]
>;
