---
title: "@venizia/dev-configs/linters"
description: "Every export of @venizia/dev-configs/linters, from the built declarations (generated)."
---

# `@venizia/dev-configs/linters`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

24 exports, 24 with TSDoc. 30 more are re-exported from other entries (listed at the end).

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
    static readonly UNION_TYPE = "TSUnionType";
    static readonly AWAIT_EXPRESSION = "AwaitExpression";
    static readonly RETURN_STATEMENT = "ReturnStatement";
    static readonly CATCH_CLAUSE = "CatchClause";
    static readonly SWITCH_CASE = "SwitchCase";
    static readonly BLOCK_STATEMENT = "BlockStatement";
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

## `ConstClassValuesRule`

*class*

`venizia/const-class-values`. An enumerable string is a const class plus `TConstValue<typeof X>`,
never a union of string literals in an exported declaration: a type alias, an interface member, a
generic constraint, a parameter or a return type of an exported function or class.

Not counted: a union that is not all string literals (a `null` or `undefined` member is ignored),
a key set (`Pick`, `Omit`, `Extract`, `Exclude`, `Record` arguments and mapped-type keys), and a
declaration that is not exported. `namePattern` narrows the rule to exported type aliases whose name
matches it (`(State|Status)$`), for a project that adopts the rule one name at a time.

```ts
export declare class ConstClassValuesRule {
    static readonly NAME = "venizia/const-class-values";
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

`venizia/effect-cleanup-consistency`. The callback of `useEffect`, `useLayoutEffect` and `useInsertionEffect`
returns a cleanup on every path or on none. An early `return;` beside a later `return () => {}` leaves React
with a cleanup on some runs only; the early exit returns a no-op instead. A bare `return;` and falling off the
end both mean "no value". It uses ESLint's code path analysis the way `consistent-return` does, so an
unreachable end of the function is not a path. A nested function's own `return` is not counted.

```ts
export declare class EffectCleanupConsistencyRule {
    static readonly NAME = "venizia/effect-cleanup-consistency";
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

The ESLint namespace the house rules live under: `venizia/<rule>`.

```ts
export declare const HOUSE_PLUGIN_NAMESPACE = "venizia";
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

The ESLint plugin that carries the house rules oxlint cannot express, registered as `venizia`.

```ts
export declare const houseEslintPlugin: ESLint.Plugin;
```

Source: `packages/dev-configs/src/linters/house/plugin.ts`

## `MaxParamsOwnRule`

*class*

`venizia/max-params-own`. A function we write takes at most `max` positional parameters;
beyond that it takes one options object. A signature that belongs to someone else is not counted: an
inline callback handed to a call (map, reduce, sort, a library handler) or to a JSX prop, a function a
declared type fixes (`const x: TFn = (...)`, a member of a typed or `satisfies` object), and a
constructor whose every parameter is injected (`@inject`). A hook's callback (`useCallback(...)`) is ours.

```ts
export declare class MaxParamsOwnRule {
    static readonly NAME = "venizia/max-params-own";
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

`venizia/no-async-hook-callback`. A hook never gets an async function: `useEffect(async () => {})` makes the
callback return a promise where React expects a cleanup function or nothing. Pass a sync callback and handle
the promise inside it with `.then`, `.catch` and `.finally`. Every argument of a `use[A-Z]...` call is checked,
`React.useX` too: an async function as the argument, as the value of a property of an object literal
(`useMutation({ mutationFn: async () => {} })`) and as an element of an array literal. A sync callback that
builds an async function inside is not an argument and is left alone.

```ts
export declare class NoAsyncHookCallbackRule {
    static readonly NAME = "venizia/no-async-hook-callback";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-async-hook-callback.rule.ts`

## `NoAwaitPromiseChainRule`

*class*

`venizia/no-await-promise-chain`. One expression uses one async style: `await` (in a try/catch when it can
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
    static readonly NAME = "venizia/no-await-promise-chain";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-await-promise-chain.rule.ts`

## `NoInlineAwaitRule`

*class*

`venizia/no-inline-await`. `await` stands alone: as a whole statement (`await f();`) or as the whole initializer
of a declaration (`const result = await f();`). Inside any other expression - a call argument, a spread, an
array or object, a ternary, a logical operator, a template literal, a member access, an assignment - it is
reported, and `return g(await f())` is the same report. `return await f()` is `no-return-await`'s.

The fix moves the `await` into a `const` in front of the statement. It is made only when nothing that does more
than read a value runs before the `await` inside the statement, and when the `await` is not in a branch, a loop
test, an unbraced `if` branch or an arrow expression body; those cases are reported and left alone.

```ts
export declare class NoInlineAwaitRule {
    static readonly NAME = "venizia/no-inline-await";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-inline-await.rule.ts`

## `NoLeakedRenderRule`

*class*

`venizia/no-leaked-render`. `{count && <X />}` draws `0` when `count` is `0`; draw nothing with
`cond ? <X /> : null`. Only a child of JSX is checked. The fix rewrites it to the ternary and keeps
any comment between `&&` and the drawn part.

```ts
export declare class NoLeakedRenderRule {
    static readonly NAME = "venizia/no-leaked-render";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-leaked-render.rule.ts`

## `NoNewErrorRule`

*class*

`venizia/no-new-error`. An error is thrown through `getError({ message })` (or an `ApplicationError`),
never `new Error(...)` or `Error(...)`: only an ApplicationError carries the status, the message code and
args, and the `extra` every IGNIS layer reads.

```ts
export declare class NoNewErrorRule {
    static readonly NAME = "venizia/no-new-error";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-new-error.rule.ts`

## `NoReturnAwaitRule`

*class*

`venizia/no-return-await`. A function returns the promise (`return f()`), never `return await f()`. Where the
`await` matters (inside `try`, `catch` or `finally`) it is written on its own line:
`const result = await f(); return result;`. An arrow whose body is an `await` is the same: `() => f()`.

```ts
export declare class NoReturnAwaitRule {
    static readonly NAME = "venizia/no-return-await";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-return-await.rule.ts`

## `NoSilentCatchRule`

*class*

`venizia/no-silent-catch`. A handled error leaves a trace (V-C-06). Reported: a `.catch(h)` (also `?.catch`,
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
    static readonly NAME = "venizia/no-silent-catch";
    static readonly RULE: Rule.RuleModule;
    static build(opts?: {
        severity?: TRuleSeverity;
    }): TRuleSeverity;
}
```

Source: `packages/dev-configs/src/linters/house/no-silent-catch.rule.ts`

## `NoUnbracedCaseRule`

*class*

`venizia/no-unbraced-case`: the statements of a `case` or `default` sit in one block, `case 'a': { ... }`.
It is the ESLint twin of oxlint's `unicorn/switch-case-braces` (`SwitchCaseBracesRule`, mode `always`).
Stacked labels with no statements stay as written. The fix wraps the statements in `{ }`.

```ts
export declare class NoUnbracedCaseRule {
    static readonly NAME = "venizia/no-unbraced-case";
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
