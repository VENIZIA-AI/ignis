---
title: "@venizia/dev-configs/linters/oxlint"
description: "Every export of @venizia/dev-configs/linters/oxlint, from the built declarations (generated)."
---

# `@venizia/dev-configs/linters/oxlint`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

30 exports, 30 with TSDoc.

## `BrowserOxlintConfigs`

*class*

`oxlintConfigs` for code that runs in a browser, React or not: the base rules plus the
secure-context ban (`crypto.randomUUID` is `undefined` on a plain-http origin). Nothing in the base
is relaxed. `ReactOxlintConfigs` builds on this preset. Takes the same options as `OxlintConfigs`.

```ts
// .configs/lints/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { BrowserOxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(BrowserOxlintConfigs.create());
```

```ts
export declare class BrowserOxlintConfigs {
    static create(opts?: IOxlintPresetOptions): OxlintConfig;
}
```

Source: `packages/dev-configs/src/linters/browser.ts`

## `EqeqeqModes`

*class*

`eqeqeq` modes: ALWAYS wants `===` everywhere, SMART still allows `== null` and comparing two literals.

```ts
export declare class EqeqeqModes {
    static readonly ALWAYS = "always";
    static readonly SMART = "smart";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TEqeqeqMode;
}
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `EqeqeqRule`

*class*

`eqeqeq`. `smart` still allows `== null` and comparing two literals.

```ts
export declare class EqeqeqRule {
    static readonly NAME = "eqeqeq";
    static build(opts?: {
        severity?: TRuleSeverity;
        mode?: TEqeqeqMode;
    }): TOxlintRuleEntry<'eqeqeq'>;
}
```

Source: `packages/dev-configs/src/linters/rules/eqeqeq.rule.ts`

## `IOxlintPresetOptions`

*interface*

Options of `OxlintConfigs.create`.

```ts
export interface IOxlintPresetOptions {
    /**
     * Also allow `||` / `||=` where the left side is a number, so `limit || 20` passes: `0` falls
     * back on purpose. A string is allowed by the base already. Left off, the base catches a real `0`
     * swallowed by `||`.
     *
     * @default false
     */
    lenientFallback?: boolean;
    /**
     * Project paths to skip - generated files, vendored code - as in `--ignore-pattern`: `src/gen/**`.
     * Every rule is turned off for them (oxlint cannot ignore a project path from `.configs/`).
     * Share the list with ESLint through `LintIgnore`.
     *
     * @default []
     */
    ignore?: string[];
}
```

Source: `packages/dev-configs/src/linters/oxlint.ts`

## `IRestrictedImportPath`

*interface*

One forbidden import path, with the message the author sees.

```ts
export interface IRestrictedImportPath {
    name: string;
    message: string;
    importNames?: string[];
}
```

Source: `packages/dev-configs/src/linters/rules/no-restricted-imports.rule.ts`

## `IRestrictedProperty`

*interface*

One forbidden property access, with the message the author sees.

```ts
export interface IRestrictedProperty {
    property: string;
    object?: string;
    message: string;
}
```

Source: `packages/dev-configs/src/linters/rules/no-restricted-properties.rule.ts`

## `LinesBetweenClassMembersRule`

*class*

`@stylistic/lines-between-class-members`. A blank line between class members, except after a one-line member, so
a run of one-line properties stays together. Overload signatures stay together too (the rule's default). oxlint
has no port of it, so it runs in ESLint.

```ts
export declare class LinesBetweenClassMembersRule {
    static readonly NAME = "@stylistic/lines-between-class-members";
    static build(opts?: {
        severity?: TRuleSeverity;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/rules/lines-between-class-members.rule.ts`

## `LintIgnore`

*class*

Project paths a lint run skips: generated files, vendored code, bundles. The same list feeds both
tools, because each reads it differently.

- oxlint: `ignorePatterns` resolve against the folder of the config file, so one in `.configs/` can
  never name a project path. `LintIgnore.oxlint` turns every rule off for the paths instead.
- ESLint: `LintIgnore.eslint` is a flat-config `ignores` entry, relative to where eslint runs.

```ts
const LINT_IGNORE = ['src/components/shadcn/**', 'dev-dist/**'];
defineConfig(ReactOxlintConfigs.create({ ignore: LINT_IGNORE })); // oxlint.config.mts
export default [LintIgnore.eslint({ patterns: LINT_IGNORE }), ...reactHouseConfigs]; // eslint.config.mjs
```

```ts
export declare class LintIgnore {
    /** A project path such as `src/gen/**`, as an override glob: it is matched from anywhere under the project. */
    static toGlob(opts: {
        pattern: string;
    }): string;
    static eslint(opts: {
        patterns: string[];
    }): Linter.Config;
    static oxlint(opts: {
        config: OxlintConfig;
        patterns: string[];
    }): OxlintConfig;
}
```

Source: `packages/dev-configs/src/linters/ignore.ts`

## `NamingConventionRule`

*class*

`@typescript-eslint/naming-convention`, owned here. oxlint has no port of it, so it runs in ESLint.
The selectors are the LoopBack 4 set the base preset carried, kept one for one.

```ts
export declare class NamingConventionRule {
    static readonly NAME = "@typescript-eslint/naming-convention";
    static readonly SELECTORS: readonly TNamingSelector[];
    /** `extraSelectors` go last, so they win over a base selector they overlap. */
    static build(opts?: {
        severity?: TRuleSeverity;
        extraSelectors?: TNamingSelector[];
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/rules/naming-convention.rule.ts`

## `NoRestrictedImportsRule`

*class*

`no-restricted-imports`. The base forbids the whole of lodash, which defeats tree-shaking.

```ts
export declare class NoRestrictedImportsRule {
    static readonly NAME = "no-restricted-imports";
    static readonly PATHS: readonly IRestrictedImportPath[];
    static build(opts?: {
        severity?: TRuleSeverity;
        extraPaths?: IRestrictedImportPath[];
    }): TOxlintRuleEntry<'no-restricted-imports'>;
}
```

Source: `packages/dev-configs/src/linters/rules/no-restricted-imports.rule.ts`

## `NoRestrictedPropertiesRule`

*class*

`no-restricted-properties`. The default bans what exists only in a secure context (https,
localhost): on a plain-http LAN origin or in a WebView, `crypto.randomUUID` is `undefined` and the
first call throws. Catches the call, `globalThis.crypto.randomUUID`, the bracket form and
destructuring; leaves `getRandomValues` alone.

```ts
export declare class NoRestrictedPropertiesRule {
    static readonly NAME = "no-restricted-properties";
    static readonly SECURE_CONTEXT: readonly IRestrictedProperty[];
    static build(opts?: {
        severity?: TRuleSeverity;
        extraProperties?: IRestrictedProperty[];
    }): TOxlintRuleEntry<'no-restricted-properties'>;
}
```

Source: `packages/dev-configs/src/linters/rules/no-restricted-properties.rule.ts`

## `NoUnusedVarsRule`

*class*

`no-unused-vars`. Unused arguments pass: an override keeps its signature. A `_name` variable is an omitted value (`{ page: _page, ...rest }`) and passes too.

```ts
export declare class NoUnusedVarsRule {
    static readonly NAME = "no-unused-vars";
    static build(opts?: {
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
    }): TOxlintRuleEntry<'no-unused-vars'>;
}
```

Source: `packages/dev-configs/src/linters/rules/no-unused-vars.rule.ts`

## `oxlintConfigs`

*const*

The oxlint port of `eslintConfigs`, generated with `@oxlint/migrate` and kept rule for rule.
Type-aware rules (`no-floating-promises`, `return-await`, ...) need `oxlint-tsgolint` installed.

Not ported: `@typescript-eslint/naming-convention` (oxlint has no equivalent yet - keep it in
ESLint), `@typescript-eslint/prefer-optional-chain` (oxlint nursery), `no-invalid-this` (covered
by `noImplicitThis` in `tsconfig.base.json`). `n/prefer-node-protocol` maps to the unicorn rule.

```ts
// .configs/lints/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(oxlintConfigs);
```

`prefer-nullish-coalescing` allows `||` on a string (`name?.trim() || 'guest'`) and reports it on
every other nullable type. `OxlintConfigs.create({ lenientFallback: true })` is the same preset
with `||` allowed on number operands too.

```ts
export declare const oxlintConfigs: OxlintConfig;
```

Source: `packages/dev-configs/src/linters/oxlint.ts`

## `OxlintConfigs`

*class*

Builds `oxlintConfigs` with options. Without any it returns the base preset unchanged.

```ts
// .configs/lints/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { OxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(OxlintConfigs.create({ lenientFallback: true }));
```

```ts
export declare class OxlintConfigs {
    static create(opts?: IOxlintPresetOptions): OxlintConfig;
}
```

Source: `packages/dev-configs/src/linters/oxlint.ts`

## `PaddingLineBetweenStatementsRule`

*class*

`@stylistic/padding-line-between-statements`: blank lines after imports, before a `return` and around block-likes.
oxlint has no port of it, so it runs in ESLint.
Stacked `case` labels stay together, or `no-fallthrough` reads the empty one as a fall-through.

```ts
export declare class PaddingLineBetweenStatementsRule {
    static readonly NAME = "@stylistic/padding-line-between-statements";
    static readonly PADDINGS: RuleOptions[typeof PaddingLineBetweenStatementsRule.NAME];
    static build(opts?: {
        severity?: TRuleSeverity;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/rules/padding-line-between-statements.rule.ts`

## `PreferNullishCoalescingRule`

*class*

`typescript/prefer-nullish-coalescing`, type-aware. Options are oxlint's, passed through.

```ts
export declare class PreferNullishCoalescingRule {
    static readonly NAME = "typescript/prefer-nullish-coalescing";
    static build(opts?: {
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
    }): TOxlintRuleEntry<'typescript/prefer-nullish-coalescing'>;
}
```

Source: `packages/dev-configs/src/linters/rules/prefer-nullish-coalescing.rule.ts`

## `ReactOxlintConfigs`

*class*

The React preset: `BrowserOxlintConfigs` (the base rules plus the secure-context ban) plus the React,
hooks and accessibility rules and `consistent-type-imports`. oxlint runs these plugins natively,
so nothing is passed in. `react/no-deprecated` has no oxlint port and is left out.

Nothing in the base is relaxed - frontend code meets the backend's standard - and
`exhaustive-deps` is an error. Takes the same options as `OxlintConfigs`.

```ts
// .configs/lints/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { ReactOxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(ReactOxlintConfigs.create());
```

```ts
export declare class ReactOxlintConfigs {
    static create(opts?: IOxlintPresetOptions): OxlintConfig;
}
```

Source: `packages/dev-configs/src/linters/react-oxlint.ts`

## `RuleSeverities`

*class*

A rule's severity, as both oxlint and ESLint accept it.

```ts
export declare class RuleSeverities {
    static readonly OFF = "off";
    static readonly WARN = "warn";
    static readonly ERROR = "error";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `SwitchCaseBracesModes`

*class*

`switch-case-braces` modes: ALWAYS gives every case its own block, AVOID drops braces that hold nothing that needs a scope.

```ts
export declare class SwitchCaseBracesModes {
    static readonly ALWAYS = "always";
    static readonly AVOID = "avoid";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TSwitchCaseBracesMode;
}
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `SwitchCaseBracesRule`

*class*

`unicorn/switch-case-braces`. `always` gives every case its own block scope.

```ts
export declare class SwitchCaseBracesRule {
    static readonly NAME = "unicorn/switch-case-braces";
    static build(opts?: {
        severity?: TRuleSeverity;
        mode?: TSwitchCaseBracesMode;
    }): TOxlintRuleEntry<'unicorn/switch-case-braces'>;
}
```

Source: `packages/dev-configs/src/linters/rules/switch-case-braces.rule.ts`

## `TConstValue`

*type*

The string values of a const class: its static members that are strings, as literal types.

```ts
export type TConstValue<T> = Extract<T[keyof T], string> & {};
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `TEqeqeqMode`

*type*

Valid eqeqeq mode values.

```ts
export type TEqeqeqMode = TConstValue<typeof EqeqeqModes>;
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `TNamingSelector`

*type*

One selector of `@typescript-eslint/naming-convention`, as its documentation types it.

```ts
export type TNamingSelector = Record<string, unknown> & {
    selector: string | string[];
};
```

Source: `packages/dev-configs/src/linters/rules/naming-convention.rule.ts`

## `TOxlintRuleEntry`

*type*

The entry oxlint's own types allow for rule `TName`, options included.

```ts
export type TOxlintRuleEntry<TName extends string> = NonNullable<NonNullable<OxlintConfig['rules']>[TName]>;
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `TRuleSeverity`

*type*

Valid rule severity values.

```ts
export type TRuleSeverity = TConstValue<typeof RuleSeverities>;
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `TSwitchCaseBracesMode`

*type*

Valid switch case braces mode values.

```ts
export type TSwitchCaseBracesMode = TConstValue<typeof SwitchCaseBracesModes>;
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `TUnusedArgsMode`

*type*

Valid unused args mode values.

```ts
export type TUnusedArgsMode = TConstValue<typeof UnusedArgsModes>;
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `TUnusedVarsScope`

*type*

Valid unused vars scope values.

```ts
export type TUnusedVarsScope = TConstValue<typeof UnusedVarsScopes>;
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `UnusedArgsModes`

*class*

`no-unused-vars` `args`: ALL checks every argument, AFTER_USED those after the last used one, NONE no argument.

```ts
export declare class UnusedArgsModes {
    static readonly ALL = "all";
    static readonly AFTER_USED = "after-used";
    static readonly NONE = "none";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TUnusedArgsMode;
}
```

Source: `packages/dev-configs/src/linters/rules/common.ts`

## `UnusedVarsScopes`

*class*

`no-unused-vars` `vars`: ALL checks globals too, LOCAL only the variables of the file.

```ts
export declare class UnusedVarsScopes {
    static readonly ALL = "all";
    static readonly LOCAL = "local";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TUnusedVarsScope;
}
```

Source: `packages/dev-configs/src/linters/rules/common.ts`
