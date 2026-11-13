---
title: "@venizia/ignis-inversion"
description: "Every export of @venizia/ignis-inversion, from the built declarations (generated)."
---

# `@venizia/ignis-inversion`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

72 exports, 72 with TSDoc.

## `AbstractContainer`

*class*

Container CONTRACT as a class, typed against `IBinding` - implementations sharing no storage start here; ones that only vary resolution start at `BaseContainer`.

```ts
export declare abstract class AbstractContainer extends BaseHelper implements IContainer {
    constructor(opts?: {
        scope: string;
    });
    abstract getMetadataRegistry(): MetadataRegistry;
    abstract bind<T>(opts: {
        key: TBindingKey;
    }): IBinding<T>;
    abstract isBound(opts: {
        key: TBindingKey;
    }): boolean;
    abstract getBinding<T>(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
    }): TNullable<IBinding<T>>;
    abstract unbind(opts: {
        key: TBindingKey;
    }): boolean;
    abstract set<T>(opts: {
        binding: IBinding<T>;
    }): void;
    abstract get<T>(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
        isOptional?: false;
    }): T;
    abstract get<T>(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
        isOptional?: boolean;
    }): T | undefined;
    abstract gets<T extends unknown[]>(opts: {
        bindings: {
            [K in keyof T]: {
                key: TBindingKey | {
                    namespace: string;
                    key: string;
                };
                isOptional?: boolean;
            };
        };
    }): {
        [K in keyof T]: T[K] | undefined;
    };
    abstract resolve<T>(cls: TClass<T>): T;
    abstract instantiate<T>(cls: TClass<T>): T;
    abstract findByTag<T = any>(opts: {
        tag: string;
        exclude?: Array<string> | Set<string>;
    }): IBinding<T>[];
    abstract startResolutionCounting(): void;
    abstract stopResolutionCounting(): void;
    abstract getResolutionCounts(): ReadonlyMap<string, number>;
    abstract clear(): void;
    abstract reset(): void;
}
```

Source: `packages/inversion/src/modules/container/abstract.ts`

## `AnyType`

*type*

Alias of `any`, for places where the type is deliberately unchecked.

```ts
export type AnyType = any;
```

Source: `packages/inversion/src/common/types.ts`

## `ApplicationError`

*class*

The error type the framework throws; `normalized` holds the resolved text, code and args a client renders.

```ts
export declare class ApplicationError extends Error {
    /** @default 400 */
    statusCode: number;
    normalized: TErrorNormalized;
    extra?: Record<string, unknown>;
    readonly logLevel?: TErrorLogLevel;
    constructor(opts: TError);
    /**
     * The message with its args filled in: `Only 2 left of TRA-01`. `message` itself stays the template,
     * so a log or an error tracker never prints a value outside the args it redacts by key - call this
     * where a plain reader stores or shows the text, such as a queue's failure reason.
     */
    toFilledText(): string;
    static getError(opts: TError): ApplicationError;
    /** One property read that cannot throw: a getter or a Proxy trap that throws reads as absent. */
    private static readProperty;
    /**
     * The status a wrapped value is allowed to keep, or `undefined` when it has none: an integer `statusCode` in 400-599
     * (what `getError` sets), else an integer `status` in 400-499 (Hono's `HTTPException` and an HTTP client's error:
     * a 5xx `status` is an upstream's, never the caller's to show).
     */
    private static readWrappedStatus;
    /** The value's own string `message` on one line (every control character escaped, as a log line must not break), else the fixed text. */
    private static readWrappedMessage;
    /**
     * The `ApplicationError` for a caught value of any type: the same instance when it already is one
     * (`isApplicationError` shape, so an error from another copy of the class counts), else a new one
     * with the original as `cause`. Never throws, whatever the value.
     *
     * What the client may see depends on what the value carried:
     * - a valid HTTP status (an integer `statusCode` in 400-599, or a `status` in 400-499) is kept, with the value's
     *   string `message`: the thrower chose to answer with it;
     * - anything else becomes a 500 that the error middleware answers as an UNEXPECTED error: a generic message to the
     *   client in production, while the real message (one line, control characters escaped, or a fixed text when there
     *   is none) and the original as `cause` stay in the log only. A driver or engine error carries SQL, paths and
     *   hosts, so it must not reach a response by being wrapped.
     *
     * The marker that makes it unexpected is private (a symbol that does not enumerate), not a public flag.
     */
    static fromUnknown(opts: {
        error: unknown;
    }): ApplicationError;
    static fromError(opts: {
        error: TResponsedError;
    }): ApplicationError;
}
```

Source: `packages/inversion/src/modules/error/app-error.ts`

## `BaseContainer`

*class*

Storage half of the container, keyed by normalized binding-key strings - resolution (`instantiate`) stays abstract, it is the part an implementation swaps.

```ts
export declare abstract class BaseContainer extends AbstractContainer {
    protected bindings: Map<string, Binding<any>>;
    /** How often each bound key has been handed out since counting started. */
    protected resolutionCounts: Map<string, number>;
    /**
     * Whether resolutions are counted. The counter sits on the hottest path in the container, and an
     * application that never reads the report should not pay for it.
     *
     * @default false
     */
    protected isCountingResolutions: boolean;
    /** Whether `startResolutionCounting` has ever run. A report read without it would name every binding, which is a wrong answer rather than an empty one. */
    protected hasStartedResolutionCounting: boolean;
    /** The string each BOUND symbol is stored under: `Symbol('x')` twice is two keys, and both print as "Symbol(x)". */
    protected symbolKeys: Map<symbol, string>;
    /** How many symbols have been bound per description, so a new one gets its suffix in one step. */
    protected symbolDescriptionCounts: Map<string, number>;
    /**
     * Nesting depth of the reads in progress. Past {@link CYCLE_CHECK_DEPTH} the keys are tracked, and
     * a key met again is a cycle: a real graph is far shallower, so the common read pays one counter.
     * Only the synchronous part is checked - a cycle through an `await` is not seen.
     */
    protected resolutionDepth: number;
    protected resolvingKeys: Set<string>;
    constructor(opts?: {
        scope: string;
    });
    getMetadataRegistry(): import("../index.js").MetadataRegistry;
    /**
     * The string a key is stored under, or `undefined` for a symbol that was never bound - a lookup
     * never records one, so reading with throwaway symbols leaves nothing behind.
     */
    protected toKeyString(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
    }): string | undefined;
    /** A bound symbol's own string: its description, suffixed (`Symbol(x)#2`) when another symbol holds it. */
    protected bindSymbolKey(opts: {
        key: symbol;
    }): string;
    bind<T>(opts: {
        key: TBindingKey;
    }): Binding<T>;
    isBound(opts: {
        key: TBindingKey;
    }): boolean;
    getBinding<T>(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
    }): TNullable<Binding<T>>;
    unbind(opts: {
        key: TBindingKey;
    }): boolean;
    set<T>(opts: {
        binding: Binding<T>;
    }): void;
    get<T>(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
        isOptional?: false;
    }): T;
    get<T>(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
        isOptional?: boolean;
    }): T | undefined;
    gets<T extends unknown[]>(opts: {
        bindings: {
            [K in keyof T]: {
                key: TBindingKey | {
                    namespace: string;
                    key: string;
                };
                isOptional?: boolean;
            };
        };
    }): {
        [K in keyof T]: T[K] | undefined;
    };
    /** Clears the counts and starts counting. Call it AFTER `initialize()`: boot resolves plenty no request ever asks for, and `bootChecks.binding.doVerify` reads every service and repository. */
    startResolutionCounting(): void;
    /** Stops counting and keeps what was counted, so `get` returns to its uncounted cost. */
    stopResolutionCounting(): void;
    /** How many times each bound key has been read since counting started. A key that was bound and never read is absent. The map is a copy. */
    getResolutionCounts(): ReadonlyMap<string, number>;
    resolve<T>(cls: TClass<T>): T;
    findByTag<T = any>(opts: {
        tag: string;
        exclude?: Array<string> | Set<string>;
    }): Binding<T>[];
    clear(): void;
    reset(): void;
}
```

Source: `packages/inversion/src/modules/container/base.ts`

## `BaseHelper`

*class*

Base for classes that carry a logging `scope` and an optional `identifier`.

```ts
export declare class BaseHelper {
    scope: string;
    /** @default '' */
    identifier: string;
    constructor(opts: {
        scope: string;
        identifier?: string;
    });
}
```

Source: `packages/inversion/src/common/base-helper.ts`

## `Binding`

*class*

One container entry under `key`, resolved to a class, a value or a provider (set with `toClass`, `toValue`, `toProvider`). Scope is transient unless `setScope` selects singleton; a key with a dot gets its first segment as a tag.

```ts
export declare class Binding<T = any> extends BaseHelper implements IBinding<T> {
    key: string;
    private bindScope;
    private tags;
    /** Boxed: a singleton may legitimately be `null`, `false`, `0`, `''` or `undefined`. */
    private cached?;
    private resolver;
    constructor(opts: {
        key: string;
    });
    static bind<T = any>(opts: {
        key: string;
    }): Binding<T>;
    toClass(value: TClass<T>): this;
    toValue(value: T): this;
    toProvider(value: TBindingProvider<T>): this;
    /** The class a `toClass` binding instantiates; `undefined` for a value or a provider. */
    boundClass(): TClass<T> | undefined;
    getBindingMeta(opts: {
        type: TConstValue<typeof BindingValueTypes>;
    }): TBindingResolverValue<T>;
    setScope(scope: TBindingScope): this;
    setTags(...tags: string[]): this;
    hasTag(tag: string): boolean;
    getTags(): string[];
    getScope(): TBindingScope;
    /** True when `getValue` answers without building anything: a cached singleton or a plain value. Nothing it reads can form a cycle. */
    isSettled(): boolean;
    getValue(container?: IContainer): T;
    clearCache(): void;
}
```

Source: `packages/inversion/src/modules/binding/binding.ts`

## `BindingKeys`

*class*

Helpers for building binding keys.

```ts
export declare class BindingKeys {
    static build(opts: {
        namespace: string;
        key: string;
    }): string;
}
```

Source: `packages/inversion/src/modules/binding/common/constants.ts`

## `BindingScopes`

*class*

Lifetime of a resolved binding: `SINGLETON` caches the first value, `TRANSIENT` builds a new one on each `getValue`.

```ts
export declare class BindingScopes {
    static readonly SINGLETON = "singleton";
    static readonly TRANSIENT = "transient";
}
```

Source: `packages/inversion/src/modules/binding/common/constants.ts`

## `BindingValueTypes`

*class*

What a binding resolves from: a class to instantiate, a plain value, or a provider.

```ts
export declare class BindingValueTypes {
    static readonly CLASS = "class";
    static readonly VALUE = "value";
    static readonly PROVIDER = "provider";
}
```

Source: `packages/inversion/src/modules/binding/common/constants.ts`

## `BindingVerifier`

*class*

Resolves bindings of the given namespaces and reports what cannot resolve.

```ts
export declare class BindingVerifier {
    private static hasBoundClass;
    private static classOf;
    private static skipName;
    private static matchesSkip;
    private static readString;
    /** What a thrown value says about the thing it could not find; a constructor's own error says nothing. */
    private static readMissing;
    /**
     * Resolves every binding of the given namespaces once and reports every failure, instead of stopping
     * at the first. It changes nothing in the container. A failed binding is a result, never a throw:
     * `assertResolve` is the throwing form.
     */
    static verify(opts: IVerifyBindingsOptions): IBindingVerification;
    /**
     * `verify`, and one `ApplicationError` when a binding failed or a skip matched nothing: the
     * message lists `<key>: <message>` per failure, `extra.missing` maps each missing key or class name
     * to the bindings that needed it.
     */
    static assertResolve(opts: IVerifyBindingsOptions & {
        scope: string;
    }): IBindingVerification;
}
```

Source: `packages/inversion/src/modules/container/verifier.ts`

## `Container`

*class*

Default container: constructor + property injection driven by the decorator metadata registry.

```ts
export declare class Container extends BaseContainer {
    constructor(opts?: {
        scope: string;
    });
    /**
     * The class form reads the key the REGISTRATION recorded, so a call-site override and an imperative
     * `application.service(X)` both resolve. `@inject` takes a key or a class; metadata a framework
     * writes may carry both, and then the class wins and the key is the fallback for a class nothing
     * recorded - one bound by hand with `bind({ key }).toClass(X)`. An optional class with neither
     * resolves to `undefined`, as an optional key would.
     */
    protected resolveBindingKey(opts: {
        key?: TBindingKey;
        target?: TInjectTarget;
        isOptional?: boolean;
        cls: TClass<unknown>;
        at: string;
    }): TBindingKey | undefined;
    instantiate<T>(cls: TClass<T>): T;
}
```

Source: `packages/inversion/src/modules/container/container.ts`

## `ErrorLogLevels`

*class*

Declared here, not imported from helpers' `LogLevels` (browser-safe); a helpers guard pins them equal.

```ts
export declare class ErrorLogLevels {
    static readonly ERROR = "error";
    static readonly EMERG = "emerg";
    static readonly WARN = "warn";
    static readonly INFO = "info";
    static readonly DEBUG = "debug";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/inversion/src/modules/error/common/constants.ts`

## `ErrorScopes`

*class*

Categories an error definition can belong to, set in `TErrorDefinition.category`.

```ts
export declare class ErrorScopes {
    static readonly AUTH = "auth";
    static readonly VALIDATION = "validation";
    static readonly BUSINESS = "business";
    static readonly SYSTEM = "system";
    static readonly INTEGRATION = "integration";
}
```

Source: `packages/inversion/src/modules/error/definition.ts`

## `fromError`

*const*

Rebuilds an `ApplicationError` from the wire payload a client received; same as `ApplicationError.fromError`.

```ts
export declare const fromError: (opts: {
    error: TResponsedError;
}) => ApplicationError;
```

Source: `packages/inversion/src/modules/error/app-error.ts`

## `getError`

*const*

Builds an `ApplicationError`; same as `ApplicationError.getError`.

```ts
export declare const getError: (opts: TError) => ApplicationError;
```

Source: `packages/inversion/src/modules/error/app-error.ts`

## `IBinding`

*interface*

A container entry: one key bound to a class, a value or a provider, with a scope and tags.

```ts
export interface IBinding<T = any> {
    /** Normalized at construction - a symbol key arrives here as its string form. */
    key: string;
    toClass(value: TClass<T>): this;
    toValue(value: T): this;
    toProvider(value: TBindingProvider<T>): this;
    getBindingMeta(opts: {
        type: TConstValue<typeof BindingValueTypes>;
    }): TBindingResolverValue<T>;
    setScope(scope: TBindingScope): this;
    getScope(): TBindingScope;
    setTags(...tags: string[]): this;
    hasTag(tag: string): boolean;
    getTags(): string[];
    getValue(container?: IContainer): T;
    clearCache(): void;
}
```

Source: `packages/inversion/src/modules/binding/common/types.ts`

## `IBindingFailure`

*interface*

One binding that threw while being resolved, with the missing key or class when the error names one.

```ts
export interface IBindingFailure {
    /** The binding that could not resolve, that is, who needs the missing thing. */
    key: string;
    message: string;
    /** An injected key nobody bound (`extra.unboundKey` of the container's error). */
    missingKey?: string;
    /** An injected class nobody registered (`extra.unregisteredClass` of the container's error). */
    unregisteredClass?: string;
    /** The thrown object, unchanged. */
    error: unknown;
}
```

Source: `packages/inversion/src/modules/container/verifier.ts`

## `IBindingKeyRecord`

*interface*

What `MetadataKeys.BINDING_KEY` holds.

```ts
export interface IBindingKeyRecord {
    key: TBindingKey;
    isProvisional: boolean;
}
```

Source: `packages/inversion/src/modules/registry/common/types.ts`

## `IBindingTag`

*interface*

Free-form map of tag names to values.

```ts
export interface IBindingTag {
    [name: string]: unknown;
}
```

Source: `packages/inversion/src/common/types.ts`

## `IBindingVerification`

*interface*

Result of verifying bindings: the keys that resolved, the failures, and the `skip` entries that matched nothing.

```ts
export interface IBindingVerification {
    /** Keys resolved, in container order, namespaces in the order given. */
    verified: string[];
    failures: IBindingFailure[];
    unmatchedSkips: TBindingSkip[];
}
```

Source: `packages/inversion/src/modules/container/verifier.ts`

## `IContainer`

*interface*

Binds keys, resolves them and instantiates classes with their injected dependencies.

```ts
export interface IContainer {
    getMetadataRegistry(): MetadataRegistry;
    bind<T>(opts: {
        key: TBindingKey;
    }): IBinding<T>;
    isBound(opts: {
        key: TBindingKey;
    }): boolean;
    getBinding<T>(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
    }): TNullable<IBinding<T>>;
    unbind(opts: {
        key: TBindingKey;
    }): boolean;
    set<T>(opts: {
        binding: IBinding<T>;
    }): void;
    get<T>(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
        isOptional?: false;
    }): T;
    get<T>(opts: {
        key: TBindingKey | {
            namespace: string;
            key: string;
        };
        isOptional?: boolean;
    }): T | undefined;
    gets<T extends unknown[]>(opts: {
        bindings: {
            [K in keyof T]: {
                key: TBindingKey | {
                    namespace: string;
                    key: string;
                };
                isOptional?: boolean;
            };
        };
    }): {
        [K in keyof T]: T[K] | undefined;
    };
    resolve<T>(cls: TClass<T>): T;
    instantiate<T>(cls: TClass<T>): T;
    findByTag<T = any>(opts: {
        tag: string;
        exclude?: Array<string> | Set<string>;
    }): IBinding<T>[];
    clear(): void;
    reset(): void;
}
```

Source: `packages/inversion/src/modules/container/common/types.ts`

## `IErrorKeyRegistry`

*interface*

Augmented per-package via declaration merging, driving `messageCode` autocomplete.

```ts
export interface IErrorKeyRegistry {
}
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `IInjectMetadata`

*interface*

Metadata recorded for an injected constructor parameter; `index` is its position.

```ts
export interface IInjectMetadata {
    key?: TBindingKey;
    /** Named by class, or by a function returning it; the key is read off the class at resolve time. */
    target?: TInjectTarget;
    index: number;
    isOptional?: boolean;
}
```

Source: `packages/inversion/src/modules/registry/common/types.ts`

## `inject`

*const*

Marks a property or constructor parameter for dependency injection.

```ts
export declare const inject: (opts: TInjectOptions) => (target: any, propertyName: string | symbol | undefined, parameterIndex?: number) => void;
```

Source: `packages/inversion/src/modules/metadata/injectors.ts`

## `IPropertyMetadata`

*interface*

Metadata recorded for an injected property.

```ts
export interface IPropertyMetadata {
    bindingKey?: TBindingKey;
    /** Named by class, or by a function returning it; the key is read off the class at resolve time. */
    target?: TInjectTarget;
    isOptional?: boolean;
}
```

Source: `packages/inversion/src/modules/registry/common/types.ts`

## `IProvider`

*interface*

A value source resolved against a container; `value` runs on each resolution of the binding it backs.

```ts
export interface IProvider<T> {
    value(container: IContainer): T;
}
```

Source: `packages/inversion/src/modules/binding/common/types.ts`

## `isApplicationError`

*const*

An `ApplicationError` by shape - a numeric `statusCode` and a `normalized` with its `text` - so it
holds across the CJS and ESM copies of this class, where `instanceof` does not. A plain `Error`
that merely carries a `statusCode` (an HTTP client's, an engine's) is not one.

An error from a copy older than 0.2.2-0 matches but has no `toFilledText()`.

```ts
export declare const isApplicationError: (error: unknown) => error is ApplicationError;
```

Source: `packages/inversion/src/modules/error/app-error.ts`

## `isClass`

*const*

Tells a CONSTRUCTOR from a RESOLVER via source text - `prototype !== undefined` is true of every non-arrow function. Sound only on ES2020+ output (classes emit as `class`); ES5 bundling breaks it.

```ts
export declare const isClass: <T>(target: unknown) => target is TClass<T>;
```

Source: `packages/inversion/src/common/utilities.ts`

## `isClassProvider`

*const*

True for a function whose prototype has a `value` method, so a provider class is told apart from a plain provider function.

```ts
export declare const isClassProvider: <T>(target: unknown) => target is TClass<IProvider<T>>;
```

Source: `packages/inversion/src/modules/binding/common/types.ts`

## `IVerifyBindingsOptions`

*interface*

Input to `BindingVerifier`: the container and the namespaces whose bindings are resolved.

```ts
export interface IVerifyBindingsOptions {
    container: IContainer;
    /**
     * A binding is in a namespace when it carries the tag `Binding` sets from the first segment of its
     * key: `services.Orders` is in `services`. Required: inversion does not know which namespaces an
     * application uses. A namespace that itself holds a dot is not supported.
     */
    namespaces: string[];
    /** Bindings to leave unresolved. A skip that matches no enumerated binding is reported in `unmatchedSkips`. */
    skip?: TBindingSkip[];
}
```

Source: `packages/inversion/src/modules/container/verifier.ts`

## `Logger`

*class*

Static console logger with `[INFO]`, `[WARN]`, `[ERROR]` and `[DEBUG]` prefixes. `debug` prints only when enabled through `enableDebug` or when the `DEBUG` environment variable is set at load time.

```ts
export declare class Logger {
    private static debugEnabled;
    static enableDebug(opts: {
        enabled: boolean;
    }): void;
    static info(message: string, ...args: unknown[]): void;
    static warn(message: string, ...args: unknown[]): void;
    static error(message: string, ...args: unknown[]): void;
    static debug(message: string, ...args: unknown[]): void;
}
```

Source: `packages/inversion/src/common/logger.ts`

## `MessageCode`

*class*

Message codes: dot-separated lower snake_case segments, at least two (`namespace.reason`).

```ts
export declare class MessageCode {
    static readonly SEPARATOR = ".";
    static readonly SEGMENT_PATTERN: RegExp;
    static readonly MIN_SEGMENTS = 2;
    static readonly DEFAULT = "core.system_error";
    private static errorFactory;
    /**
     * Registered by the package entry at module init; keeps the throws identical without a
     * static import of app-error (that import was the cycle).
     * @internal Framework wiring; consumers must not replace the factory.
     */
    static useErrorFactory(opts: {
        factory: TErrorFactory;
    }): void;
    /** Builds a code from its segments, throwing on a malformed one - codes are declared at module scope, so a bad code fails the process at import instead of shipping dead into production. */
    static build(opts: {
        parts: Array<string>;
    }): string;
    /** True when `code` is well-formed. Takes `unknown` because it guards codes arriving from outside - a guard that throws on the very input it exists to screen is not a guard. */
    static isValid(code: unknown): boolean;
    /** Normalizes an absent, empty or non-string code to {@link DEFAULT}. */
    static resolve(code?: TNullable<string>): string;
}

type TErrorFactory = (opts: TError) => Error;
```

Source: `packages/inversion/src/modules/error/message-code.ts`

## `MessageTemplate`

*class*

Fills a catalog template - `Only %{available} left of %{sku}` - from its args. The error keeps the
template in `message` and `normalized.text`, so a log redacts values by key and a client can
translate `code` + `args`; this is where a reader that wants the sentence gets it.

```ts
export declare class MessageTemplate {
    /**
     * Each `%{key}` replaced by `String(args[key])`. A key with no arg (absent or `undefined`) stays as
     * written and is listed in `missing`. Never throws: it runs inside the last-resort error handler.
     */
    static render(opts: {
        text: string;
        args: unknown;
    }): {
        text: string;
        missing: Array<string>;
    };
}
```

Source: `packages/inversion/src/modules/error/message-template.ts`

## `MetadataKeys`

*const*

Symbol keys under which the decorators store reflect metadata: properties, injects and the binding key.

```ts
export declare const MetadataKeys: {
    PROPERTIES: symbol;
    INJECT: symbol;
    BINDING_KEY: symbol;
};
```

Source: `packages/inversion/src/modules/metadata/common/constants.ts`

## `metadataRegistry`

*const*

The shared `MetadataRegistry` instance.

```ts
export declare const metadataRegistry: MetadataRegistry;
```

Source: `packages/inversion/src/modules/registry/registry.ts`

## `MetadataRegistry`

*class*

Central metadata registry for storing and retrieving decorator metadata.

```ts
export declare class MetadataRegistry extends BaseHelper {
    constructor();
    define<Target extends object = object, Value = unknown>(opts: {
        target: Target;
        key: TBindingKey;
        value: Value;
    }): void;
    get<Target extends object = object, Value = unknown>(opts: {
        target: Target;
        key: TBindingKey;
    }): Value | undefined;
    has<Target extends object = object>(opts: {
        target: Target;
        key: TBindingKey;
    }): boolean;
    delete<Target extends object = object>(opts: {
        target: Target;
        key: TBindingKey;
    }): boolean;
    getKeys<Target extends object = object>(opts: {
        target: Target;
    }): TBindingKey[];
    getMethodNames<T = unknown>(opts: {
        target: TClass<T>;
    }): string[];
    clearMetadata<T extends object = object>(opts: {
        target: T;
    }): void;
    setPropertyMetadata<T extends object = object>(opts: {
        target: T;
        propertyName: string | symbol;
        metadata: IPropertyMetadata;
    }): void;
    getPropertiesMetadata<T extends object = object>(opts: {
        target: T;
    }): Map<string | symbol, IPropertyMetadata> | undefined;
    getPropertyMetadata<T extends object = object>(opts: {
        target: T;
        propertyName: string | symbol;
    }): IPropertyMetadata | undefined;
    setInjectMetadata<T extends object = object>(opts: {
        target: T;
        index: number;
        metadata: IInjectMetadata;
    }): void;
    getInjectMetadata<T extends object = object>(opts: {
        target: T;
    }): IInjectMetadata[] | undefined;
    /** `isProvisional` marks a DERIVED key; a registration replaces it silently, having seen the call-site override. */
    setBindingKey<T extends object = object>(opts: {
        target: T;
        key: TBindingKey;
        isProvisional?: boolean;
    }): void;
    /** Own metadata only: a subclass is not registered, and the parent key would resolve the wrong binding. */
    getBindingKey<T extends object = object>(opts: {
        target: T;
    }): TBindingKey | undefined;
}
```

Source: `packages/inversion/src/modules/registry/registry.ts`

## `ObjectUtility`

*class*

Object helpers. Hand-written rather than `lodash/isEmpty` and `lodash/omit`: this package is bundled
for browsers, where importing lodash for two functions costs 24 KB.

```ts
export declare class ObjectUtility {
    /**
     * True for a value carrying nothing: `null`/`undefined`, an empty string, array, `Map`, `Set`, or an
     * object with no own enumerable keys. A number, boolean or function is empty too - it holds no
     * entries.
     *
     * NOT a plain `!value`: `!{}` is `false` while an empty object IS empty, so the two disagree on
     * exactly the case a swap would silently flip.
     */
    static isEmpty(opts: {
        value: unknown;
    }): boolean;
    /**
     * A shallow copy without `keys`. Matches lodash on the shapes we pass it - a flat key list, never a
     * nested path.
     */
    static omit<T extends object, K extends PropertyKey>(opts: {
        source: T;
        keys: readonly K[];
    }): Omit<T, Extract<K, keyof T>>;
}
```

Source: `packages/inversion/src/common/utilities.ts`

## `ResolverUtility`

*class*

Readers for the value-or-resolver vocabulary the container branches on.

```ts
export declare class ResolverUtility {
    /** A resolver is anything callable that is not a class - a class is a value here, never a factory. */
    private static isResolver;
    private static isAsyncResolver;
    /** Reads a value-or-resolver. A class constructor is returned as-is; only a plain function is called. */
    static resolveValue<T>(opts: {
        value: TValueOrResolver<T>;
    }): T;
    /** `resolveValue` for a resolver that may answer a promise. */
    static resolveValueAsync<T>(opts: {
        value: TValueOrAsyncResolver<T>;
    }): Promise<T>;
    /** Reads what `@inject({ target })` named. The function form is called HERE, never at decoration: that is what lets a class reached through an import cycle be named at all. Answers `undefined` when the function hands back something that is not a class. The container resolves synchronously, so there is no async form. */
    static resolveInjectTarget(opts: {
        target: TInjectTarget;
    }): TClass<unknown> | undefined;
}
```

Source: `packages/inversion/src/common/utilities.ts`

## `TAbstractConstructor`

*type*

Like `TConstructor`, but also matches abstract classes.

```ts
export type TAbstractConstructor<T> = abstract new (...args: never[]) => T;
```

Source: `packages/inversion/src/common/types.ts`

## `TAsyncResolver`

*type*

A function that returns `T` or a `Promise` of `T`.

```ts
export type TAsyncResolver<T> = (...args: never[]) => T | Promise<T>;
```

Source: `packages/inversion/src/common/types.ts`

## `TBindingKey`

*type*

Identifier for a binding: a string or a symbol.

```ts
export type TBindingKey = string | symbol;
```

Source: `packages/inversion/src/common/types.ts`

## `TBindingProvider`

*type*

What `toProvider` accepts: a function taking the container, or a class implementing {@link IProvider}.

```ts
export type TBindingProvider<T> = (<C extends IContainer>(container: C) => T) | TClass<IProvider<T>>;
```

Source: `packages/inversion/src/modules/binding/common/types.ts`

## `TBindingResolverValue`

*type*

What a binding's resolver holds - a class, a plain value, or a provider.

```ts
export type TBindingResolverValue<T> = TClass<T> | T | TBindingProvider<T>;
```

Source: `packages/inversion/src/modules/binding/common/types.ts`

## `TBindingScope`

*type*

Union of the `BindingScopes` values.

```ts
export type TBindingScope = TConstValue<typeof BindingScopes>;
```

Source: `packages/inversion/src/modules/binding/common/constants.ts`

## `TBindingSkip`

*type*

A class (matched exactly, never by subclass), a class name, or a binding key.

```ts
export type TBindingSkip = TClass<unknown> | string;
```

Source: `packages/inversion/src/modules/container/verifier.ts`

## `TBindingValueType`

*type*

Union of the `BindingValueTypes` values.

```ts
export type TBindingValueType = TConstValue<typeof BindingValueTypes>;
```

Source: `packages/inversion/src/modules/binding/common/constants.ts`

## `TClass`

*type*

A class producing `T`. Read its static members through a type that declares them, such as `typeof MyClass`.

```ts
export type TClass<T> = TConstructor<T>;
```

Source: `packages/inversion/src/common/types.ts`

## `TConstructor`

*type*

A concrete class constructor producing `T`. Its arguments are `never[]`, so any constructor fits; build an instance with `Reflect.construct`.

```ts
export type TConstructor<T> = new (...args: never[]) => T;
```

Source: `packages/inversion/src/common/types.ts`

## `TConstValue`

*type*

`& {}` keeps the literal set but stops it widening to `string` / `number` in mutable positions; see `TConstValue` in `@venizia/ignis-helpers`.

```ts
export type TConstValue<T extends TClass<unknown>> = Extract<ValueOf<T>, string | number> & {};
```

Source: `packages/inversion/src/common/types.ts`

## `TError`

*type*

The input of `ApplicationError` and `getError`: a catalogued definition or free-form fields.

```ts
export type TError = TErrorByDefinition | TErrorByField;
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorByDefinition`

*type*

Catalogued form - `message` and `statusCode` override the definition's defaults; the object form is partial, so `{ message: { args } }` amends the args and keeps the definition's text and code.

```ts
export type TErrorByDefinition = TErrorCommon & {
    error: TErrorDefinition;
    message?: TErrorMessageOverride;
    [key: string]: unknown;
};

/** Shared by both input forms - unknown keys ride the index signature into `extra`, so a throw site can attach context the framework does not model, and so does a mistyped key. */
type TErrorCommon = {
    statusCode?: number;
    messageArgs?: Record<string, unknown>;
    cause?: unknown;
    extra?: Record<string, unknown>;
    transform?: TErrorNormalizeTransformFn;
    /** @default 'error' */
    logLevel?: TErrorLogLevel;
};
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorByField`

*type*

Free-form: an invariant, a misconfiguration, a failure carrying no i18n code. `message` is the only required field - most throw sites legitimately fall back to `MessageCode.DEFAULT`.

```ts
export type TErrorByField = TErrorCommon & {
    message: TErrorMessage;
    messageCode?: TErrorKey | (string & Record<never, never>);
    /** Never valid here - `error` is the catalogued form's discriminant and a CONSUMED key, so a wrapped failure passed as `error` would vanish; use `cause`. */
    error?: never;
    [key: string]: unknown;
};

/** Shared by both input forms - unknown keys ride the index signature into `extra`, so a throw site can attach context the framework does not model, and so does a mistyped key. */
type TErrorCommon = {
    statusCode?: number;
    messageArgs?: Record<string, unknown>;
    cause?: unknown;
    extra?: Record<string, unknown>;
    transform?: TErrorNormalizeTransformFn;
    /** @default 'error' */
    logLevel?: TErrorLogLevel;
};
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorDefinition`

*type*

A catalogued error: a message with a required code, an HTTP status code, and an optional scope and description.

```ts
export type TErrorDefinition = {
    message: TErrorDefinitionMessage;
    statusCode: number;
    category?: TErrorScope;
    description?: string;
};
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorDefinitionMessage`

*type*

Catalogued message - `code` required, typed `string` and not {@link TErrorKey}: catalogs DECLARE the registry keys, so typing against the registry would be self-referential.

```ts
export type TErrorDefinitionMessage = Omit<TErrorMessageInput, 'code'> & {
    code: string;
};
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorKey`

*type*

A registered message code when `IErrorKeyRegistry` is augmented, otherwise any `string`.

```ts
export type TErrorKey = [keyof IErrorKeyRegistry] extends [never] ? string : Extract<keyof IErrorKeyRegistry, string>;
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorLogLevel`

*type*

The level an error is logged at.

```ts
export type TErrorLogLevel = TConstValue<typeof ErrorLogLevels>;
```

Source: `packages/inversion/src/modules/error/common/constants.ts`

## `TErrorMessage`

*type*

The free-form input: a bare string is the historical shape.

```ts
export type TErrorMessage = string | TErrorMessageInput;
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorMessageInput`

*type*

The message a CALLER supplies - only `text` is required, the rest is what {@link TErrorNormalized} resolves; every other message shape is derived from this one.

```ts
export type TErrorMessageInput = {
    text: string;
    code?: TErrorKey | (string & Record<never, never>);
    args?: Record<string, unknown>;
};
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorMessageOverride`

*type*

The catalogued form's override - every field optional, since the definition supplies the rest.

```ts
export type TErrorMessageOverride = string | Partial<TErrorMessageInput>;
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorNormalized`

*type*

Resolved message a client renders. All fields always present - no null-checks downstream.

```ts
export type TErrorNormalized = {
    text: string;
    code: string;
    args: Record<string, unknown>;
};
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorNormalizeTransformFn`

*type*

Builds {@link TErrorNormalized} in place of the default; `message` is the default it replaces.

```ts
export type TErrorNormalizeTransformFn = (opts: {
    message: TErrorNormalized;
    statusCode: number;
    extra?: Record<string, unknown>;
}) => TErrorNormalized;
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TErrorScope`

*type*

One of the `ErrorScopes` values.

```ts
export type TErrorScope = TConstValue<typeof ErrorScopes>;
```

Source: `packages/inversion/src/modules/error/definition.ts`

## `TInjectOptions`

*type*

Either a key, or the class bound under it - never both. The class may be named directly or through a function, which defers the reference past an import cycle.

```ts
export type TInjectOptions = {
    isOptional?: boolean;
    registry?: MetadataRegistry;
} & ({
    key: TBindingKey;
    target?: never;
} | {
    target: TInjectTarget;
    key?: never;
});
```

Source: `packages/inversion/src/modules/metadata/injectors.ts`

## `TInjectTarget`

*type*

What `@inject({ target })` names: the class, or a function returning it. The function form defers the reference to resolve time, which is how a class reached through an import cycle stays reachable.

```ts
export type TInjectTarget = TValueOrResolver<TClass<unknown>>;
```

Source: `packages/inversion/src/common/types.ts`

## `TNullable`

*type*

A `T` that may also be `undefined` or `null`.

```ts
export type TNullable<T> = T | undefined | null;
```

Source: `packages/inversion/src/common/types.ts`

## `TRegisterErrors`

*type*

Registers a catalog's keys with {@link IErrorKeyRegistry}, via `declare module '@venizia/ignis-helpers' { interface IErrorKeyRegistry extends TRegisterErrors<typeof CategoryErrors> {} }`.

```ts
export type TRegisterErrors<T extends Record<string, TErrorDefinition>> = Record<T[keyof T]['message']['code'], true>;
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TResolver`

*type*

A function that returns `T` when called.

```ts
export type TResolver<T> = (...args: never[]) => T;
```

Source: `packages/inversion/src/common/types.ts`

## `TResponsedError`

*type*

Wire payload as a CLIENT receives it - the input to {@link ApplicationError.fromError}. Every field is optional on purpose: a client parses what a gateway, a proxy or an older server actually sent.

```ts
export type TResponsedError = {
    message?: string;
    statusCode?: number;
    normalized?: Partial<TErrorNormalized>;
    extra?: Record<string, unknown>;
    requestId?: string;
    details?: Record<string, unknown>;
};
```

Source: `packages/inversion/src/modules/error/common/types.ts`

## `TValueOrAsyncResolver`

*type*

A `T` itself, or a function that returns it or a `Promise` of it.

```ts
export type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;
```

Source: `packages/inversion/src/common/types.ts`

## `TValueOrResolver`

*type*

A `T` itself, or a function that returns it.

```ts
export type TValueOrResolver<T> = T | TResolver<T>;
```

Source: `packages/inversion/src/common/types.ts`

## `ValueOf`

*type*

Union of the property value types of `T`.

```ts
export type ValueOf<T> = T[keyof T];
```

Source: `packages/inversion/src/common/types.ts`

## `ValueOrPromise`

*type*

A `T` or a `Promise` of it, for APIs that accept sync and async results.

```ts
export type ValueOrPromise<T> = T | Promise<T>;
```

Source: `packages/inversion/src/common/types.ts`
