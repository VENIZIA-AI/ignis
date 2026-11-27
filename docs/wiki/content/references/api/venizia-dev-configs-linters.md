---
title: "@venizia/dev-configs/linters"
description: "Every export of @venizia/dev-configs/linters, from the built declarations (generated)."
---

# `@venizia/dev-configs/linters`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

38 exports, 38 with TSDoc. 30 more are re-exported from other entries (listed at the end).

## `AstNode`

*class*

Reads an AST node without trusting its type: TypeScript nodes carry fields estree does not declare.

```ts
export declare class AstNode {
    /** A field of an AST node. */
    static readField(opts: {
        node: unknown;
        key: string;
    }): unknown;
    /** Whether `value` is an AST node: an object with a string `type`. */
    static isNode(value: unknown): value is Rule.Node;
    /** The node's `type`, or `undefined` for anything that is not an AST node. */
    static getType(opts: {
        node: unknown;
    }): string | undefined;
}
```

Source: `packages/dev-configs/src/linters/house/common.ts`

## `AstNodeTypes`

*class*

The estree node types the house rules visit - computed visitor keys, so the names stay PascalCase as ESLint needs them.

```ts
export declare class AstNodeTypes {
    static readonly NEW_EXPRESSION = "NewExpression";
    static readonly CALL_EXPRESSION = "CallExpression";
    static readonly FUNCTION_DECLARATION = "FunctionDeclaration";
    static readonly FUNCTION_EXPRESSION = "FunctionExpression";
    static readonly ARROW_FUNCTION_EXPRESSION = "ArrowFunctionExpression";
    static readonly EXPORT_NAMED_DECLARATION = "ExportNamedDeclaration";
    static readonly EXPORT_ALL_DECLARATION = "ExportAllDeclaration";
    static readonly IMPORT_DECLARATION = "ImportDeclaration";
    static readonly IMPORT_SPECIFIER = "ImportSpecifier";
    static readonly IMPORT_EXPRESSION = "ImportExpression";
    static readonly CLASS_DECLARATION = "ClassDeclaration";
    static readonly INTERFACE_DECLARATION = "TSInterfaceDeclaration";
    static readonly UNION_TYPE = "TSUnionType";
    static readonly AWAIT_EXPRESSION = "AwaitExpression";
    static readonly RETURN_STATEMENT = "ReturnStatement";
    static readonly CATCH_CLAUSE = "CatchClause";
    static readonly SWITCH_CASE = "SwitchCase";
    static readonly BLOCK_STATEMENT = "BlockStatement";
    static readonly ARRAY_EXPRESSION = "ArrayExpression";
    static readonly AS_EXPRESSION = "TSAsExpression";
    static readonly ASSIGNMENT_EXPRESSION = "AssignmentExpression";
    static readonly ASSIGNMENT_PATTERN = "AssignmentPattern";
    static readonly BINARY_EXPRESSION = "BinaryExpression";
    static readonly CHAIN_EXPRESSION = "ChainExpression";
    static readonly CLASS_IMPLEMENTS = "TSClassImplements";
    static readonly CONDITIONAL_EXPRESSION = "ConditionalExpression";
    static readonly EMPTY_STATEMENT = "EmptyStatement";
    static readonly EXPORT_DEFAULT_DECLARATION = "ExportDefaultDeclaration";
    static readonly EXPORT_SPECIFIER = "ExportSpecifier";
    static readonly EXPRESSION_STATEMENT = "ExpressionStatement";
    static readonly IDENTIFIER = "Identifier";
    static readonly INTERFACE_HERITAGE = "TSInterfaceHeritage";
    static readonly JSX_ATTRIBUTE = "JSXAttribute";
    static readonly JSX_ELEMENT = "JSXElement";
    static readonly JSX_EXPRESSION_CONTAINER = "JSXExpressionContainer";
    static readonly JSX_FRAGMENT = "JSXFragment";
    static readonly LITERAL = "Literal";
    static readonly LITERAL_TYPE = "TSLiteralType";
    static readonly LOGICAL_EXPRESSION = "LogicalExpression";
    static readonly MAPPED_TYPE = "TSMappedType";
    static readonly MEMBER_EXPRESSION = "MemberExpression";
    static readonly METHOD_DEFINITION = "MethodDefinition";
    static readonly NON_NULL_EXPRESSION = "TSNonNullExpression";
    static readonly NULL_KEYWORD = "TSNullKeyword";
    static readonly OBJECT_EXPRESSION = "ObjectExpression";
    static readonly PRIVATE_IDENTIFIER = "PrivateIdentifier";
    static readonly PROGRAM = "Program";
    static readonly PROPERTY = "Property";
    static readonly SATISFIES_EXPRESSION = "TSSatisfiesExpression";
    static readonly SEQUENCE_EXPRESSION = "SequenceExpression";
    static readonly SPREAD_ELEMENT = "SpreadElement";
    static readonly STATIC_BLOCK = "StaticBlock";
    static readonly TEMPLATE_ELEMENT = "TemplateElement";
    static readonly TEMPLATE_LITERAL = "TemplateLiteral";
    static readonly THIS_EXPRESSION = "ThisExpression";
    static readonly TRY_STATEMENT = "TryStatement";
    static readonly TYPE_ALIAS_DECLARATION = "TSTypeAliasDeclaration";
    static readonly TYPE_ASSERTION = "TSTypeAssertion";
    static readonly TYPE_PARAMETER_INSTANTIATION = "TSTypeParameterInstantiation";
    static readonly TYPE_QUERY = "TSTypeQuery";
    static readonly TYPE_REFERENCE = "TSTypeReference";
    static readonly UNARY_EXPRESSION = "UnaryExpression";
    static readonly UNDEFINED_KEYWORD = "TSUndefinedKeyword";
    static readonly VARIABLE_DECLARATION = "VariableDeclaration";
    static readonly VARIABLE_DECLARATOR = "VariableDeclarator";
}
```

Source: `packages/dev-configs/src/linters/house/common.ts`

## `AwaitSupport`

*class*

The shared parts of the two `await` rules: where a statement can go before another, what may run first, fresh names.

```ts
export declare class AwaitSupport {
    static parentOf(opts: {
        node: unknown;
    }): unknown;
    /** An ESTree node of the lint run: it has a `type` and a `range`. */
    static isNode(value: unknown): value is Rule.Node;
    static rangeOf(opts: {
        node: unknown;
    }): [number, number] | undefined;
    /**
     * The statement that can take a `const` in front of it so that `awaitNode` is evaluated first, or `undefined`
     * when hoisting would change what runs: the `await` sits in a branch (`?:`, the right of `&&`, `||`, `??`),
     * in a loop test or update, in an unbraced `if` branch, in an optional chain, or in an arrow expression body.
     */
    static hoistTarget(opts: {
        awaitNode: unknown;
    }): Rule.Node | undefined;
    static isPure(opts: {
        node: unknown;
    }): boolean;
    /**
     * Whether something that does more than read a value runs, inside `statement`, before `awaitNode` does.
     * Hoisting the `await` in front of the statement would then run it first.
     */
    static hasEffectBefore(opts: {
        statement: Rule.Node;
        awaitNode: unknown;
        sourceCode: SourceCode;
    }): boolean;
    /** The leading whitespace of the line a node starts on. */
    static indentOf(opts: {
        node: Rule.Node;
        sourceCode: SourceCode;
    }): string;
    /** The nearest function or the program that holds `node`: the scope a new name must be free in. */
    static scopeNodeOf(opts: {
        node: Rule.Node;
    }): Rule.Node;
    /**
     * The outermost function that holds `node` (the program when no function does): the one namespace a hoisted name
     * must be unique in. A name that is free in the nearest function only could still shadow, or be shadowed by, the
     * name another fix hoisted in a function around it or a block inside it.
     */
    static outermostScopeOf(opts: {
        node: Rule.Node;
    }): Rule.Node;
    /**
     * The names handed out in this lint pass, per outermost scope. They are shared by every rule that hoists a name: the
     * rules run in the same pass over the same text and their fixes are applied together, so two rules that each
     * remembered their own names both handed out `result`. A `SourceCode` lasts for one pass of one file.
     */
    private static readonly PASS_NAMES;
    /**
     * `base`, or `base2`, `base3`... the first word that does not appear in the outermost function (or program) holding
     * `node` and that no rule has handed out already in this lint pass: no two fixes of one pass declare the same name,
     * and none declares a name that is in scope anywhere around or inside the place it is hoisted to.
     */
    static freshName(opts: {
        node: Rule.Node;
        base: string;
        sourceCode: SourceCode;
    }): string;
    /**
     * The range to replace with the name that stands for an `await`: the `await` itself, widened over the parentheses
     * around it when they only grouped it (`(await f()).x`, `!(await f())`).
     */
    static replaceRangeOf(opts: {
        awaitNode: Rule.Node;
        sourceCode: SourceCode;
    }): [number, number];
}
```

Source: `packages/dev-configs/src/linters/house/await-support.ts`

## `BrowserApiPatterns`

*class*

The browser APIs ARDOR (`@venizia/ardor-react`) wraps in a hook, one row each. `@venizia/prefer-framework-api` reads this
table, so adding a pattern is adding a row here. Only forms a rule can tell apart reliably are rows: a hand-rolled
debounce or a draft-saving timer is not.

```ts
export declare class BrowserApiPatterns {
    static readonly PACKAGE = "@venizia/ardor-react";
    static readonly TABLE: ReadonlyArray<IBrowserApiPattern>;
}
```

Source: `packages/dev-configs/src/linters/house/browser-api-patterns.ts`

## `ConstClassValuesRule`

*class*

`@venizia/const-class-values`. An enumerable string is a const class plus `TConstValue<typeof X>`,
never a union of string literals in an exported declaration: a type alias, an interface member, a
generic constraint, a parameter or a return type of an exported function or class.

Not counted: a union that is not all string literals (a `null` or `undefined` member is ignored),
a key set (`Pick`, `Omit`, `Extract`, `Exclude`, `Record` arguments and mapped-type keys), and a
declaration that is not exported. `namePattern` narrows the rule to exported type aliases whose name
matches it (`(State|Status)$`), for a project that adopts the rule one name at a time.

```ts
export declare class ConstClassValuesRule {
    static readonly NAME = "@venizia/const-class-values";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
        namePattern?: string;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/const-class-values.rule.ts`

## `EffectCleanupConsistencyRule`

*class*

`@venizia/effect-cleanup-consistency`. The callback of `useEffect`, `useLayoutEffect` and `useInsertionEffect`
returns a cleanup on every path or on none. An early `return;` beside a later `return () => {}` leaves React
with a cleanup on some runs only; the early exit returns a no-op instead. A bare `return;` and falling off the
end both mean "no value". It uses ESLint's code path analysis the way `consistent-return` does, so an
unreachable end of the function is not a path. A nested function's own `return` is not counted.

```ts
export declare class EffectCleanupConsistencyRule {
    static readonly NAME = "@venizia/effect-cleanup-consistency";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/effect-cleanup-consistency.rule.ts`

## `eslintConfigs`

*const*

The full ESLint preset, owned here: the LoopBack 4 rule set on the ESLint and typescript-eslint
recommended presets, type-aware through the project service. A project on oxlint uses
`oxlintConfigs` + `namingConventionConfigs` instead.

```ts
export declare const eslintConfigs: Linter.Config[];
```

Source: `packages/dev-configs/src/linters/eslint.ts`

## `FrameworkApiPatterns`

*class*

The forms the framework replaces outside React, one row each. Unlike `BrowserApiPatterns`, a row counts anywhere in a
file: a service or a module function can call the API as well as a component.

```ts
export declare class FrameworkApiPatterns {
    static readonly TABLE: ReadonlyArray<IFrameworkApiPattern>;
}
```

Source: `packages/dev-configs/src/linters/house/framework-api-patterns.ts`

## `FrameworkExports`

*class*

The type names the installed `@venizia/*` packages export, read from their published `.d.ts` files: the names a project
must import, not write again. Only interfaces and type aliases count (a class or a const is not a type your own
`interface Logger` copies). A declaration scan only (the TypeScript parser, no program, no type check), memoized per
package for the life of the process: after an upgrade an ESLint server must be restarted to read the new names.

It never stops a lint run. TypeScript is looked up from the linted package, the working directory and dev-configs' own
install, and only a copy that has the parser API is used (the native TypeScript 7 has none); a package.json or a `.d.ts`
that cannot be read is skipped. Whatever is missing, the answer is fewer names, never an exception.

```ts
export declare class FrameworkExports {
    static readonly SCOPE = "@venizia/";
    private static readonly manifests;
    private static readonly packages;
    private static readonly typescripts;
    /** `value` as the TypeScript module when it has the parser API this scan uses. */
    private static isParser;
    /** The text of a file, or `undefined` when it cannot be read. */
    private static readText;
    /** A JSON file, or `undefined` when it cannot be read or does not parse. */
    private static readJson;
    /**
     * TypeScript for the linted package: from its own folder, the working directory, or this package's install, the first that
     * has the parser API. `undefined` when none does (the rule then reports nothing).
     */
    static loadTypeScript(opts: {
        directory: string;
    }): typeof ts | undefined;
    /** The nearest package.json at or above `directory`. */
    static manifestFor(opts: {
        directory: string;
    }): IPackageManifest | undefined;
    /** The folder of the installed package `name`, looked up from `directory` upwards. */
    private static locate;
    /** Every `.d.ts` path an `exports` value names, with the subpath it is reached by. */
    private static entriesOf;
    /** The declaration file a relative specifier points at (`./x.js` is `./x.d.ts`). */
    private static resolveRelative;
    /**
     * The names `file` exports, each with what it is, following `export *` into relative files and into other `@venizia/*`
     * packages (an umbrella package re-exports its siblings). A name re-exported by `export { X } from` takes the type it has
     * where it is declared; `export type { X }` is a type whatever the target says.
     */
    private static namesOf;
    /** Type name to the specifier that exports it (`@venizia/ignis-helpers/common`), for one installed package. */
    private static readPackage;
    /**
     * The type names the `@venizia/*` packages that `directory`'s project depends on export, each with the specifier to import
     * it from. The project's own package is left out: it may declare what it exports.
     */
    static of(opts: {
        directory: string;
    }): Map<string, string>;
}
```

Source: `packages/dev-configs/src/linters/house/framework-exports.ts`

## `HookSupport`

*class*

The shared parts of the two hook rules: which call is a hook, and which argument is a function.

```ts
export declare class HookSupport {
    /** `useX(...)` and `React.useX(...)`: the name the call is made through, or `undefined` when it is not a plain name. */
    static calleeName(opts: {
        call: unknown;
    }): string | undefined;
    static isHook(opts: {
        name: string | undefined;
    }): boolean;
    static isEffectHook(opts: {
        name: string | undefined;
    }): boolean;
    /** An arrow or a function expression: the two forms a hook callback is written in. */
    static isCallback(opts: {
        node: unknown;
    }): boolean;
    static isAsync(opts: {
        node: unknown;
    }): boolean;
    /**
     * The async functions an argument hands over: the argument itself, a property value of an object literal
     * (`useMutation({ mutationFn: async () => {} })`, an async method too) and an element of an array literal, at any
     * depth of literals. It does not look inside a function: what a sync callback builds is not an argument.
     */
    static asyncFunctionsIn(opts: {
        node: unknown;
    }): unknown[];
}
```

Source: `packages/dev-configs/src/linters/house/hook-support.ts`

## `HOUSE_PLUGIN_NAMESPACE`

*const*

The ESLint namespace the house rules live under: `@venizia/<rule>`.

```ts
export declare const HOUSE_PLUGIN_NAMESPACE = "@venizia";
```

Source: `packages/dev-configs/src/linters/house/common.ts`

## `houseConfigs`

*const*

The ESLint side of a project that lints with oxlint: the naming convention, the house rules and the async style
rules - everything oxlint cannot express. Run it next to `oxlintConfigs`.

```js
// .configs/lints/eslint.config.mjs
import { houseConfigs } from '@venizia/dev-configs/linters';

export default houseConfigs;
```

```ts
export declare const houseConfigs: Linter.Config[];
```

Source: `packages/dev-configs/src/linters/house/configs.ts`

## `houseEslintPlugin`

*const*

The ESLint plugin that carries the house rules oxlint cannot express, registered as `@venizia`.

```ts
export declare const houseEslintPlugin: ESLint.Plugin;
```

Source: `packages/dev-configs/src/linters/house/plugin.ts`

## `IBrowserApiPattern`

*interface*

One browser API the framework already wraps, and what to use instead.

```ts
export interface IBrowserApiPattern {
    /** The name `ignore` takes to switch the pattern off. */
    id: string;
    match: TBrowserApiMatch;
    /** What to use: the hooks, named as the message prints them. */
    hooks: string;
    /** The hand-written form, as the message prints it. */
    written: string;
}
```

Source: `packages/dev-configs/src/linters/house/browser-api-patterns.ts`

## `IFrameworkApiPattern`

*interface*

One hand-written form `@venizia/prefer-framework-api` reports anywhere in a file.

```ts
export interface IFrameworkApiPattern {
    /** The name `ignore` takes to switch the row off. */
    id: string;
    match: TFrameworkApiMatch;
    /** The whole message. */
    message: string;
    /** The row applies only in a package that depends on a package whose name starts with this. */
    dependsOn?: string;
    /** The package that writes the API: the row is not reported in it. */
    owner?: string;
}
```

Source: `packages/dev-configs/src/linters/house/framework-api-patterns.ts`

## `ImportSupport`

*class*

Adds the import a rule's autofix needs, once, and not at all when the name is already in scope.

```ts
export declare class ImportSupport {
    /** The top-level declaration types that bring a name into the file. */
    private static readonly DECLARATIONS;
    /** The name a top-level statement declares, whether or not it is exported. */
    private static declaredName;
    /** Whether the file imports `name`. */
    static isImported(opts: {
        context: Rule.RuleContext;
        name: string;
    }): boolean;
    /** Whether the file declares `name` itself at the top level (a copy or a stand-in, not an import). */
    static isDeclared(opts: {
        context: Rule.RuleContext;
        name: string;
    }): boolean;
    /** The name the file binds the import `name` to (`TNullable as N` answers `N`), or `undefined` when it does not import it. */
    static importedAs(opts: {
        context: Rule.RuleContext;
        name: string;
        asValue?: boolean;
    }): string | undefined;
    /** Whether `name` is imported (under its own name or an alias) or declared at the top level of the file. */
    static isInScope(opts: {
        context: Rule.RuleContext;
        name: string;
    }): boolean;
    /**
     * Whether an import can be added to this file: it is an ES module (it has an import or an export) and not a declaration
     * file. An import added to a script, or to an ambient `.d.ts`, would turn it into a module and change what it declares.
     */
    static canAdd(opts: {
        context: Rule.RuleContext;
    }): boolean;
    /** The statement the new import goes before when the file has no import: the first one after the leading directives (`'use client'`). */
    private static firstAfterDirectives;
    /**
     * The fixes that import `name` from `source`: after the last import, or before the first statement that is not a
     * directive. None when the name is already in scope; `undefined` when an import cannot be added to this file.
     */
    static ensure(opts: {
        context: Rule.RuleContext;
        fixer: Rule.RuleFixer;
        name: string;
        source: string;
        isType: boolean;
    }): Array<Rule.Fix> | undefined;
    /**
     * The fix that adds `name` to an import the file already has from `source`, when that import is a plain named list: a
     * second `import { ... } from 'same-module'` line is what `no-duplicate-imports` reports. A type goes into an
     * `import type` list as it is, and into a value list as `type Name`; a value only goes into a value list.
     */
    private static mergeInto;
}
```

Source: `packages/dev-configs/src/linters/house/import-support.ts`

## `MaxParamsOwnRule`

*class*

`@venizia/max-params-own`. A function we write takes at most `max` positional parameters;
beyond that it takes one options object. A signature that belongs to someone else is not counted: an
inline callback handed to a call (map, reduce, sort, a library handler) or to a JSX prop, a function a
declared type fixes (`const x: TFn = (...)`, a member of a typed or `satisfies` object), and a
constructor whose every parameter is injected (`@inject`). A hook's callback (`useCallback(...)`) is ours.

```ts
export declare class MaxParamsOwnRule {
    static readonly NAME = "@venizia/max-params-own";
    static readonly DEFAULT_MAX = 5;
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        /** @default 'error' */
        severity?: TRuleSeverity;
        /** @default 5 */
        max?: number;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/max-params-own.rule.ts`

## `namingConventionConfigs`

*const*

The one rule of `eslintConfigs` that oxlint cannot run yet, as a standalone ESLint preset to run
next to `oxlintConfigs`. It needs no type information, so ESLint stays fast.

```js
// .configs/lints/eslint.config.mjs
import { namingConventionConfigs } from '@venizia/dev-configs/linters';

export default namingConventionConfigs;
```

```ts
export declare const namingConventionConfigs: Linter.Config[];
```

Source: `packages/dev-configs/src/linters/eslint.ts`

## `NoAsyncHookCallbackRule`

*class*

`@venizia/no-async-hook-callback`. A hook never gets an async function: `useEffect(async () => {})` makes the
callback return a promise where React expects a cleanup function or nothing. Pass a sync callback and handle
the promise inside it with `.then`, `.catch` and `.finally`. Every argument of a `use[A-Z]...` call is checked,
`React.useX` too: an async function as the argument, as the value of a property of an object literal
(`useMutation({ mutationFn: async () => {} })`) and as an element of an array literal. A sync callback that
builds an async function inside is not an argument and is left alone.

```ts
export declare class NoAsyncHookCallbackRule {
    static readonly NAME = "@venizia/no-async-hook-callback";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-async-hook-callback.rule.ts`

## `NoAwaitNewChainRule`

*class*

`@venizia/no-await-new-chain`. A method is never called on a fresh instance inside an `await`:
`await new Runner({ ... }).run(...)` and `const text = await new Response(body).text()` declare the instance first,
then await on its own line (`const runner = new Runner({ ... }); await runner.run(...);`). A builder chain
(`await new SignJWT(claims).setIssuer(iss).sign(key)`) declares the builder, then awaits its last call.

`await new Promise(...)` calls no method and is allowed. `await new X().prop` is not a call and is allowed.

The fix moves the instance, or the chain up to the last call, into a `const` in front of the statement. It is made
only when nothing that does more than read a value runs before the `await` inside the statement; otherwise the
finding is reported and left alone.

```ts
export declare class NoAwaitNewChainRule {
    static readonly NAME = "@venizia/no-await-new-chain";
    /** The expression under any transparent wrapper. */
    private static unwrap;
    /**
     * The receiver of the last call when the awaited value is a method call on a `new` (directly or through a chain of
     * calls and member reads), else `undefined`.
     */
    private static receiverOf;
    /**
     * Whether the `await` is the whole statement (`await f();`) or the whole initializer of a declaration with one
     * declarator (`const { a } = await f();`). Nothing runs before it there: a binding pattern and its defaults are
     * evaluated after the initializer.
     */
    private static isFirstToRun;
    /** `Response` becomes `response`, `ns.SignJWT` becomes `signJWT`; anything else is `instance`. */
    private static nameOf;
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-await-new-chain.rule.ts`

## `NoAwaitPromiseChainRule`

*class*

`@venizia/no-await-promise-chain`. One expression uses one async style: `await` (in a try/catch when it can
fail), or a promise chain that is not awaited. An `await` whose operand - after parentheses, `!`, `as`,
`satisfies` and an optional chain - is a call of `.then`, `.catch` or `.finally` (`?.then(`, `['then'](`, a
thenable such as a query builder) is reported once, however long the chain. A chain that is returned or stands
as a statement is not awaited and is not reported, nor is `await Promise.all(xs.map(f))`, `await new Promise(...)`,
`await x.then` (no call), or an `await` inside a callback of a chain.

The fix is made for one shape only, `const|let x = await f().catch(() => <value>)` (see `planFix` for every
condition), and writes `let x; try { x = await f(); } catch (error) { x = <value>; }` (`catch { ... }` when the value does not read the error): the `const` becomes a
`let`, a type annotation stays, the catch variable takes the handler's parameter name (`error` without one,
renamed when the name is taken), and is typed `any` when the value reads it, as the handler's parameter was.
The try also catches a synchronous throw of `f()`, which the chain let through. Everything else is reported.

```ts
export declare class NoAwaitPromiseChainRule {
    static readonly NAME = "@venizia/no-await-promise-chain";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-await-promise-chain.rule.ts`

## `NoInlineAwaitRule`

*class*

`@venizia/no-inline-await`. `await` stands alone: as a whole statement (`await f();`) or as the whole initializer
of a declaration (`const result = await f();`). Inside any other expression - a call argument, a spread, an
array or object, a ternary, a logical operator, a template literal, a member access, an assignment - it is
reported, and `return g(await f())` is the same report. `return await f()` is `no-return-await`'s.

The fix moves the `await` into a `const` in front of the statement. It is made only when nothing that does more
than read a value runs before the `await` inside the statement, and when the `await` is not in a branch, a loop
test, an unbraced `if` branch or an arrow expression body; those cases are reported and left alone.

```ts
export declare class NoInlineAwaitRule {
    static readonly NAME = "@venizia/no-inline-await";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-inline-await.rule.ts`

## `NoLeakedRenderRule`

*class*

`@venizia/no-leaked-render`. `{count && <X />}` draws `0` when `count` is `0`; draw nothing with
`cond ? <X /> : null`. Only a child of JSX is checked. The fix rewrites it to the ternary and keeps
any comment between `&&` and the drawn part.

```ts
export declare class NoLeakedRenderRule {
    static readonly NAME = "@venizia/no-leaked-render";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-leaked-render.rule.ts`

## `NoNewErrorRule`

*class*

`@venizia/no-new-error`. An error is thrown through `getError({ message })` (or an `ApplicationError`),
never `new Error(...)` or `Error(...)`: only an ApplicationError carries the status, the message code and
args, and the `extra` every IGNIS layer reads.

```ts
export declare class NoNewErrorRule {
    static readonly NAME = "@venizia/no-new-error";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-new-error.rule.ts`

## `NoParentImportRule`

*class*

`@venizia/no-parent-import`. An import that climbs out of its folder (`../x`) is written from the package's import map
instead (`#src/x`): it keeps its meaning when the file moves, and reads the same from every depth.

The fix is made only when the nearest `package.json` maps `#src/*` to a folder and the import lands inside that folder;
every other finding is reported and left alone. A same-folder `./x` is never reported.

No preset turns it on. A project that wants it adds, after the preset:
`{ files: ['**\/*.{ts,tsx,mts,cts}'], rules: { '@venizia/no-parent-import': 'warn' } }`.

```ts
export declare class NoParentImportRule {
    static readonly NAME = "@venizia/no-parent-import";
    static readonly ALIAS = "#src";
    /** One scan reads the same package.json for every file of a package. */
    private static readonly maps;
    /** A parsed JSON file (a package.json or a tsconfig without comments), or `undefined` when it cannot be read: a broken file never stops a lint run, the import is reported without a fix. */
    private static readManifest;
    /** The import map of the package that owns `directory`, or `undefined` when it has none for `#src/*`. */
    private static mapOf;
    /**
     * `#src/<path>` for the specifier `specifier` written in `filename`, when the map reaches it AND the result resolves.
     *
     * What the map appends decides it. With `./src/*.js` (the preset) the written `.js`, `.ts` or `.tsx` goes (the map adds
     * `.js`, and TypeScript reads that as the source), an extensionless file stays as it is, and a folder gets `/index`; any
     * other extension is kept only when the map has a `#src/*<ext>` key for it. With a bare `./src/*` the path must keep the
     * extension it is written with, because TypeScript does not guess one through `imports`; an extensionless specifier is
     * reported and left alone.
     */
    private static aliasFor;
    /**
     * `/index` when the target is a folder and the package cannot resolve a folder through `#src/*`. A package.json `imports`
     * map has no directory index, so `#src/folder` only resolves where the tsconfig `paths` entry `#src/*` also lists
     * `./src/*\/index`; elsewhere the fix writes the file out. A target that is a file, or not on disk, is left as written.
     */
    private static indexSuffix;
    /** Whether the package's tsconfig `paths` maps `#src/*` to a folder index as well. */
    private static pathsResolveFolders;
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/no-parent-import.rule.ts`

## `NoReturnAwaitRule`

*class*

`@venizia/no-return-await`. A function returns the promise (`return f()`), never `return await f()`. Where the
`await` matters (inside `try`, `catch` or `finally`) it is written on its own line:
`const result = await f(); return result;`. An arrow whose body is an `await` is the same: `() => f()`.

```ts
export declare class NoReturnAwaitRule {
    static readonly NAME = "@venizia/no-return-await";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-return-await.rule.ts`

## `NoShadowFrameworkTypeRule`

*class*

`@venizia/no-shadow-framework-type`. A type alias or interface written in your project under the name a `@venizia/*`
package already exports (`ValueOrPromise`, `TNullable`, `TConstValue`) is a copy of the framework's: import it.

The names come from the installed packages' `.d.ts` files (see `FrameworkExports`), for the packages your nearest
`package.json` depends on. Not reported: a name the file imports, a name shorter than `minLength` (default 4, so a
generic `T` never matches), a name in `allow`, anything inside `declare module` or `declare global` (an augmentation),
a declaration file, and a package's own declarations of what it exports. There is no fix: a copy may differ from the
original, so the replacement is the author's to check.

```ts
export declare class NoShadowFrameworkTypeRule {
    static readonly NAME = "@venizia/no-shadow-framework-type";
    static readonly DEFAULT_MIN_LENGTH = 4;
    /** Whether an interface lists `name` (bare or through a namespace import) among the types it extends. */
    private static extendsSameName;
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
        allow?: Array<string>;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/no-shadow-framework-type.rule.ts`

## `NoSilentCatchRule`

*class*

`@venizia/no-silent-catch`. A handled error leaves a trace (V-C-06). Reported: a `.catch(h)` (also `?.catch`,
`['catch']`) whose handler is an arrow or function expression that ignores its parameter and whose body is empty
or only gives back a constant (`() => null`, `() => undefined`, `() => ({})`, `() => []`, `() => {}`,
`function () {}`), and a `catch` block that is empty, holds only a comment, or only assigns or returns a constant
without reading the error. Handled, and not reported: anything that reads the error (logs, wraps or rethrows
it), makes any call (a log, a cleanup, a fallback), throws, or reads another variable.

It is not ESLint's `no-empty`: `no-empty` reports an empty block only, lets a block that holds a comment pass,
and never sees `.catch(() => null)`. Both report `catch {}`, each with its own message. There is no fix: what to
log is a decision. A deliberate silent catch carries an `eslint-disable-next-line` with its reason.

```ts
export declare class NoSilentCatchRule {
    static readonly NAME = "@venizia/no-silent-catch";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-silent-catch.rule.ts`

## `NoUnbracedCaseRule`

*class*

`@venizia/no-unbraced-case`: the statements of a `case` or `default` sit in one block, `case 'a': { ... }`.
It is the ESLint twin of oxlint's `unicorn/switch-case-braces` (`SwitchCaseBracesRule`, mode `always`).
Stacked labels with no statements stay as written. The fix wraps the statements in `{ }`.

```ts
export declare class NoUnbracedCaseRule {
    static readonly NAME = "@venizia/no-unbraced-case";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/no-unbraced-case.rule.ts`

## `paddingConfigs`

*const*

The blank-line padding rules: after imports, before a `return`, between class members, around block-like statements.
ESLint-only: oxlint has none of the four rules.
They need the TypeScript parser of `namingConventionConfigs` or `eslintConfigs`.

```ts
export declare const paddingConfigs: Linter.Config[];
```

Source: `packages/dev-configs/src/linters/padding.ts`

## `PreferFrameworkApiRule`

*class*

`@venizia/prefer-framework-api`. A browser API that `@venizia/ardor-react` wraps in a hook (`window.matchMedia`, a
`ResizeObserver`, `navigator.onLine`, a `beforeunload` listener, `navigator.clipboard.writeText`, `window.confirm`...) is
used through the hook, which owns the subscribe and cleanup. The rows are `BrowserApiPatterns.TABLE`; the message names
the hook. The rule is for apps: the package that ships the hooks (the nearest `package.json` is named
`@venizia/ardor-react`) is not reported.

The rows of `FrameworkApiPatterns.TABLE` and of the `extra` option are not about React: they report anywhere in a file,
with their own message, in a package their `dependsOn` and `owner` allow.

For the hook rows, only a reference to the global is reported: a `window`, `navigator` or `document` the file binds itself is not. And only
where a hook can be called: in a component (a PascalCase function that draws JSX) or a hook (`useX`), see `isInReact`. A
module function, a class and an event handler making a one-off call are left alone. Hooks the author wants to bypass on
purpose take an `eslint-disable-next-line` with the reason, or `ignore` lists pattern ids.

```ts
export declare class PreferFrameworkApiRule {
    static readonly NAME = "@venizia/prefer-framework-api";
    /** The dotted text of `a.b.c` (identifiers only), or `undefined` for anything else. */
    private static pathOf;
    /** `window.navigator.onLine` is `navigator.onLine`. */
    private static withoutGlobalRoot;
    /** Whether the root identifier of `path` is the global one: no scope of the file binds it. */
    private static isGlobal;
    private static readonly FUNCTIONS;
    /** Whether a function has JSX anywhere in it: with a PascalCase name, that is a component. */
    private static readonly jsxCache;
    private static containsJsx;
    /** The name a function is known by: its own, or the variable it is assigned to (through one `memo(...)` / `forwardRef(...)`). */
    private static nameOf;
    /** A hook (`useX`), or a component: a PascalCase function that draws JSX. */
    private static isReactFunction;
    /** Whether `fn` is an argument of a hook call (`useEffect(() => ...)`): the callback runs for the component or the hook. */
    private static isHookCallback;
    /**
     * Whether `node` is in a component or a hook, which is where a hook can be called. A subscription (a listener, an
     * observer) counts through any handler or helper on the way up: it belongs in a hook. A plain read (`window.innerWidth`,
     * `window.confirm`) counts only in the body of the component or the hook, or in a callback it hands to a hook
     * (`useEffect`, `useMemo`): inside an event handler, or outside every component (a module function, a class), it is a
     * one-off call a hook cannot make.
     */
    private static isInReact;
    /** The rows that apply in a file of this package: the table and `extra`, less the ignored ones. */
    private static rowsFor;
    /** The listeners the rows outside React need, by node type or selector. */
    private static rowListeners;
    /** The name of `a.name` or `a['name']`; empty for `a[name]`, whose name the file does not state. */
    private static memberName;
    /** The field each type of an `extra` row cannot do without. */
    private static readonly ROW_FIELDS;
    /** Whether an `extra` entry is a row this rule can run. The option schema refuses the others before it gets here. */
    private static isRow;
    /** The schema of the `match` of an `extra` row: one shape per type, each with its own field required. */
    private static matchSchema;
    private static readonly FALLBACK_KEYS;
    /** Whether `node` is the value used when another is missing. */
    private static isFallback;
    /** Whether an import declaration brings in types only. */
    private static isTypeOnly;
    /** One listener object: two rows that visit the same node both run. */
    private static merge;
    private static isListener;
    static readonly RULE: Rule.RuleModule;
    /**
     * `hooks: false` leaves out the rows of `BrowserApiPatterns`, for code that is not React: a `use...` function of another
     * library reads as a hook. An entry that sets options replaces the earlier ones, so it states `hooks` again.
     */
    static build(opts?: {
        severity?: TRuleSeverity;
        hooks?: boolean;
        ignore?: ReadonlyArray<string>;
        extra?: ReadonlyArray<IFrameworkApiPattern>;
    }): Linter.RuleEntry;
}
```

Source: `packages/dev-configs/src/linters/house/prefer-framework-api.rule.ts`

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
 * `property`, the source of a regular expression, only a member whose name matches it.
 */
 | {
    type: 'member';
    objects: ReadonlyArray<string>;
    property?: string;
}
/**
 * A string or a template whose text matches `pattern`, the source of a regular expression. With `isFallbackOnly`, only
 * where it stands in for a missing value: after `??` or `||`, a parameter default, or a `default`, `defaultValue` or
 * `fallback` property.
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

## Re-exported

- `BrowserOxlintConfigs` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `EqeqeqModes` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `EqeqeqRule` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `IOxlintPresetOptions` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `IRestrictedImportPath` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `IRestrictedProperty` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `LinesBetweenClassMembersRule` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `LintIgnore` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `NamingConventionRule` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `NoRestrictedImportsRule` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `NoRestrictedPropertiesRule` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `NoUnusedVarsRule` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `oxlintConfigs` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `OxlintConfigs` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `PaddingLineBetweenStatementsRule` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `PreferNullishCoalescingRule` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `ReactOxlintConfigs` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `RuleSeverities` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `SwitchCaseBracesModes` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `SwitchCaseBracesRule` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `TConstValue` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `TEqeqeqMode` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `TNamingSelector` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `TOxlintRuleEntry` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `TRuleSeverity` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `TSwitchCaseBracesMode` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `TUnusedArgsMode` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `TUnusedVarsScope` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `UnusedArgsModes` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
- `UnusedVarsScopes` from [`@venizia/dev-configs/linters/oxlint`](/references/api/venizia-dev-configs-linters-oxlint)
