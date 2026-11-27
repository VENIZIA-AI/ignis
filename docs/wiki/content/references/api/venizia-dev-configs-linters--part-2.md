---
title: "@venizia/dev-configs/linters (2 of 2)"
description: "Every export of @venizia/dev-configs/linters, from the built declarations (generated)."
---

# `@venizia/dev-configs/linters (2 of 2)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 2 of [`@venizia/dev-configs/linters`](/references/api/venizia-dev-configs-linters).

## `PreferPromiseSleepRule`

*class*

`@venizia/prefer-promise-sleep`. A sleep written by hand, `new Promise((resolve) => setTimeout(resolve, ms))`, is
`PromiseUtility.sleep({ ms })` (`@venizia/ignis-helpers/core`). Only that exact shape is reported: a callback that
does anything else is not a sleep.

The fix replaces the expression and adds the import; `source` is where `PromiseUtility` comes from, `null` turns
the fix off.

```ts
export declare class PreferPromiseSleepRule {
    static readonly NAME = "@venizia/prefer-promise-sleep";
    static readonly DEFAULT_SOURCE = "@venizia/ignis-helpers/core";
    /** The `setTimeout(<resolve>, <delay>)` call a sleep callback consists of, or `undefined`. */
    private static delayOf;
    /** `PromiseUtility.sleep({ ms })`, with the shorthand when the delay is a variable named `ms`. */
    private static call;
    /** Whether `setTimeout` at `node` resolves to a binding of the file (not the global timer). */
    private static isRebound;
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
        source?: string | null;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/prefer-promise-sleep.rule.ts`

## `PreferTNullableRule`

*class*

`@venizia/prefer-tnullable`. `X | null | undefined` is `TNullable<X>`, the framework's own name for it
(`@venizia/ignis-helpers/common`). A union with only `null` or only `undefined` is not reported: those say
something different.

The fix rewrites the union and adds the import. `source` is where `TNullable` comes from (default the helpers
`common` entry); `null` turns the import, and so the fix, off for a project that has no such package.

```ts
export declare class PreferTNullableRule {
    static readonly NAME = "@venizia/prefer-tnullable";
    static readonly DEFAULT_SOURCE = "@venizia/ignis-helpers/common";
    /**
     * The source of a union member with the parentheses that belong to it: a function, constructor or conditional type is
     * written `(...)` inside a union, and the member text alone (`() => void`) would change the type or not parse.
     */
    private static textOf;
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
        source?: string | null;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/prefer-tnullable.rule.ts`

## `PromiseChainSupport`

*class*

The shared parts of the promise chain rules: what a chain call is, what a constant is, what a silent handler body is.

```ts
export declare class PromiseChainSupport {
    /** `node` without the wrappers that do not change its value (`!`, `as`, `satisfies`, `<T>`, an optional chain). */
    static unwrap(opts: {
        node: unknown;
    }): unknown;
    /** The name a member access reads: `a.name`, `a['name']`, ``a[`name`]``; `undefined` for a computed key. */
    static memberName(opts: {
        member: unknown;
    }): string | undefined;
    /**
     * `then`, `catch` or `finally` when `node` (after `unwrap`) is a call of that method - `p.then(f)`, `p?.catch(f)`,
     * `p['finally'](f)` - and `undefined` for anything else. It reads the syntax only, so a thenable counts too.
     */
    static chainMethodOf(opts: {
        node: unknown;
    }): string | undefined;
    /**
     * Whether a chain call (`.then`, `.catch`, `.finally`) sits anywhere on the spine of `node`: the receivers and
     * callees a call chain is built from (`a.then(f).limit(1)` has one, `a.where(x).limit(1)` has none).
     */
    static hasChainOnSpine(opts: {
        node: unknown;
    }): boolean;
    /**
     * A value that is the same every time and reads nothing: a literal, `undefined`, a template with no `${}`, `-1`,
     * `void 0`, and an array or object literal built only from those (`[]`, `{}`, `{ items: [] }`).
     */
    static isConstant(opts: {
        node: unknown;
    }): boolean;
    /**
     * Whether the statements of a handler or a `catch` block leave no trace of the error: none at all (a comment does
     * not count), or only `return;`, `return <constant>;` and `<name or member> = <constant>;`. Anything else - a
     * call, a `throw`, a read of a variable - is a decision someone made, and counts as handled.
     */
    static isSilentBlock(opts: {
        statements: unknown;
    }): boolean;
    /** `name`, `this.name`, `a.b.c`: an assignment target that reads no computed key and calls nothing. */
    static isPlainTarget(opts: {
        node: unknown;
    }): boolean;
    /** `node` without the type-only wrappers (`as`, `satisfies`, `!`, `<T>`), keeping an optional chain. */
    static unwrapTypes(opts: {
        node: unknown;
    }): unknown;
}
```

Source: `packages/dev-configs/src/linters/house/promise-chain-support.ts`

## `reactHouseConfigs`

*const*

`houseConfigs` for a React project: `reactNamingConventionConfigs`, the house rules, the async style rules, `no-leaked-render` and the hook rules.

```ts
export declare const reactHouseConfigs: Linter.Config[];
```

Source: `packages/dev-configs/src/linters/house/configs.ts`

## `reactNamingConventionConfigs`

*const*

`namingConventionConfigs` for a React project: the base rule plus PascalCase functions in .jsx and
.tsx files, where a component is declared as `function App()`.

```ts
export declare const reactNamingConventionConfigs: Linter.Config[];
```

Source: `packages/dev-configs/src/linters/react-eslint.ts`

## `TBrowserApiMatch`

*type*

How a hand-written browser API shows up in code.

```ts
export type TBrowserApiMatch = 
/** A property of the global object read or called: `window.matchMedia(...)`, `matchMedia(...)`. */
{
    type: 'global';
    names: ReadonlyArray<string>;
}
/** A member path under a global: `navigator.onLine`, `navigator.clipboard.writeText`. */
 | {
    type: 'path';
    paths: ReadonlyArray<string>;
}
/** `new X(...)` of a global class. */
 | {
    type: 'new';
    callees: ReadonlyArray<string>;
}
/** `<object>.addEventListener('<event>', ...)`; `objects` names the objects it counts for (the globals `window`, `document`, `self` and `globalThis` when absent). */
 | {
    type: 'listener';
    events: ReadonlyArray<string>;
    objects?: ReadonlyArray<string>;
};
```

Source: `packages/dev-configs/src/linters/house/browser-api-patterns.ts`

## `TFrameworkApiMatch`

*type*

How a hand-written form shows up in code.

```ts
export type TFrameworkApiMatch = TBrowserApiMatch
/**
 * A member of a global object read or called: `localStorage.getItem`; `window.` in front is the same object. With
 * `property`, the source of a regular expression, only a member whose name matches it. With `isReadOnly`, an
 * assignment to it and a `delete` of it pass.
 */
 | {
    type: 'member';
    objects: ReadonlyArray<string>;
    property?: string;
    isReadOnly?: boolean;
}
/**
 * A string or a template whose text matches `pattern`, the source of a regular expression. With
 * `isFallbackOnly`, only where it stands in for a missing value: after `??`, `||`, `??=` or `||=`, a
 * parameter default, or a `default`, `defaultValue` or `fallback` property.
 */
 | {
    type: 'literal';
    pattern: string;
    isFallbackOnly?: boolean;
}
/** An `import` or `import()` of one of these modules; `import type` is not one. */
 | {
    type: 'import';
    sources: ReadonlyArray<string>;
}
/** Every node an ESLint selector matches. */
 | {
    type: 'selector';
    selector: string;
};
```

Source: `packages/dev-configs/src/linters/house/framework-api-patterns.ts`

## `TypedRouteContextRule`

*class*

`@venizia/typed-route-context`: reports what compiles and still leaves a route handler unchecked. It reads syntax
only, so a context passed on to another file, stored, or passed further than one method is not followed.

- a route config object declared as `IAuthRouteConfig` (or in a `Record` of it) instead of `satisfies`;
- `valid<T>()` with a type argument on a context typed from its route;
- a decorated method whose `TContextOf` names another route than its decorator;
- a handler that passes its context straight to a method of the same class typed for another route.

```ts
export declare class TypedRouteContextRule {
    static readonly NAME = "@venizia/typed-route-context";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/typed-route-context.rule.ts`

## `ZodSchemaConventionRule`

*class*

`@venizia/zod-schema-convention`. How a zod schema is named, how its inferred types are named, that a strict object
is written `z.strictObject` and `.passthrough()` is not used and, in the files a project lists, that objects are
strict and `any` and `z.coerce` are not used.

A schema is recognised file by file, without types: a call chain that starts at an import of `zod` (or `z` of
`@hono/zod-openapi`), at another schema const of the file, or at an import named `...Schema` / `..._SCHEMA` through a
method that builds a schema (`extend`, `pick`, ...). An imported schema under another name, a member
(`this.schema.extend`), a factory's result and a schema held in an object are not followed.

```ts
export declare class ZodSchemaConventionRule {
    static readonly NAME = "@venizia/zod-schema-convention";
    private static readonly ZOD_SOURCE;
    /** Re-exports `z` next to its own functions (`createRoute`), so only its `z` is zod. */
    private static readonly HONO_SOURCE;
    private static readonly SCHEMA_NAME;
    private static readonly SUFFIX;
    /** An import that names a schema: something before the suffix, so a bare `Schema` of another library is not one. */
    private static readonly IMPORTED_SCHEMA;
    /** zod's classes: `ZodError.create([])` answers a value, not a schema. */
    private static readonly ZOD_CLASS;
    private static readonly TEST_FILE;
    /** The methods that make a schema of an imported one; any other call on it may answer a value. */
    private static readonly DERIVATIONS;
    /** A chain through one of these answers a value, an error report or a part of a schema, not a schema. */
    private static readonly NOT_A_SCHEMA;
    /** The wrappers a type adds around an expression. */
    private static readonly WRAPPERS;
    private static readonly INFERENCES;
    private static readString;
    /** Whether the member access `node` leaves the schema: its value is not one. */
    private static isOutside;
    /**
     * The identifier a call chain starts from, the member its first call goes through (`''` when it calls the identifier
     * itself), when it has a call and stays a schema.
     */
    private static chainOf;
    /** The declaration an identifier resolves to, from the scope it is read in. */
    private static definitionOf;
    /** The name zod exports what an import binds, when the import is zod's: `''` for a default or a namespace. */
    private static zodImport;
    /**
     * Whether `expression` builds a schema; `seen` stops a declaration that refers to itself. `isNameTrusted` also takes
     * an import named `...Schema` for one.
     */
    private static isSchema;
    /** Whether a declaration is a const or a variable that holds a schema. */
    private static isSchemaConst;
    /** `saleOrder`, `SALE_ORDER` and `SaleOrder` are all `SaleOrder`. */
    private static toPascalCase;
    /** The name of the schema a type alias infers from, and by which inference; `undefined` for any other type. */
    private static inferenceOf;
    private static matches;
    static readonly RULE: Rule.RuleModule;
    static build(opts?: IZodSchemaConventionOptions & {
        severity?: TRuleSeverity;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/zod-schema-convention.rule.ts`
