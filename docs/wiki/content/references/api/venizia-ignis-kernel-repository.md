---
title: "@venizia/ignis-kernel/repository"
description: "Every export of @venizia/ignis-kernel/repository, from the built declarations (generated)."
---

# `@venizia/ignis-kernel/repository`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

30 exports, 30 with TSDoc. 7 more are re-exported from other entries (listed at the end).

## `AbstractDataSource`

*class*

Engine-neutral datasource root - NO SQL members. Every connector family extends this.

```ts
export declare abstract class AbstractDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}> extends BaseHelper implements IDataSource<Settings, Schema, ConfigurableOptions> {
    /** Read by {@link isDataSourceClass}. Static, so every subclass inherits it. */
    static readonly [DATA_SOURCE_BRAND] = true;
    name: string;
    settings: Settings;
    schema: Schema;
    abstract configure(opts?: ConfigurableOptions, opening?: IDataSourceOpening): ValueOrPromise<void>;
    /** The options the boot would have given `configure()`, kept for the open that the first use starts. */
    private deferredOptions?;
    /** The open in flight: every call that arrives meanwhile awaits this one promise. */
    private opening?;
    /**
     * An open that outlived its timeout and has not settled. Nothing is retried until it has: two `configure()` must never
     * run at once, and when it does settle what it built is closed, never published.
     */
    private abandoned?;
    private isOpened;
    private isShutDown;
    /**
     * Whether this family can open on first use: only a family whose every entry point first awaits {@link ensureOpen}
     * says yes (the relational one does). A family that does not is refused at boot rather than left half-working.
     */
    protected supportsDeferredOpen(): boolean;
    /** The `open.on` of `@datasource`, `start` when unset. */
    getOpenMode(): TDataSourceOpenMode;
    isOpenDeferred(): boolean;
    /** The `open.timeoutMs` of `@datasource` (ms; `0` waits for ever), 60 s when unset. */
    getOpenTimeoutMs(): number;
    /**
     * Whether the datasource is open. One that opens on first use: after the first use has finished, until `close()`. One that
     * opens at start: from the moment the application has started it, until `close()`.
     */
    isOpen(): boolean;
    /** Whether the first use is opening the datasource right now. */
    isOpening(): boolean;
    /** Whether `close()` has begun. A datasource that opens on first use is not reopened after it. */
    isClosed(): boolean;
    /**
     * The handles `configure()` gets as its second argument, in both modes. The root has no connector, client or transaction to
     * hand out; a family that has them overrides {@link createOpening}.
     */
    getOpening(): IDataSourceOpening;
    protected createOpening(): IDataSourceOpening;
    /**
     * The boot's replacement for `configure()` on a datasource that opens on first use: records the options and opens nothing.
     * Refused for a family that cannot honour it.
     */
    deferOpen(opts: {
        options?: object;
    }): void;
    /**
     * Resolves once the datasource is open. At once for one that opens with the application. Otherwise the first caller
     * starts `configure()` and the rest await the same promise, so it runs once; a failure rejects all of them, undoes what the
     * failed `configure()` left ({@link discardPartialOpen}) and clears the slot, so the next call opens afresh. After
     * `close()` it rejects: a stopped application does not reopen its datasources.
     */
    ensureOpen(): Promise<void>;
    private runOpen;
    /** When an abandoned open finally settles, whatever it built is closed (it was never published) and retries are allowed again. */
    private settleAbandoned;
    private discardOpenAttempt;
    /** Undoes what a `configure()` that threw left behind, so the next open starts clean. The root holds nothing; a family that keeps a client overrides it. */
    protected discardPartialOpen(): ValueOrPromise<void>;
    /**
     * Waits for an open in flight and refuses any later one. A family's `close()` calls it first, so a stop that arrives
     * during the first use closes what that open built instead of racing it.
     */
    protected settleOpening(): Promise<void>;
    getSettings(): Settings;
    getSchema(): Schema;
    /** Capability probe, overridden by connectors that support it (e.g. postgres reports `{ transactions: true }`). */
    getCapabilities(): IDataSourceCapabilities;
    /** Nothing to release at this root; a family that holds a connection overrides it. */
    close(): Promise<void>;
    /** Defaults to throwing NotSupported - only connectors with real transaction support override this; async so callers get a rejected promise, not a synchronous throw that skips try/catch. */
    beginTransaction(_opts?: ITransactionOptions): Promise<ITransaction>;
    /** Model classes bound to this datasource via `@repository` metadata - paradigm-free (no schema/relation resolution). */
    protected getBoundModelClasses(): Array<TClass<unknown>>;
    /** Walks model classes bound to this datasource, reads a connector-specific artifact via `read`, and returns a name-keyed registry - skips undefined reads, throws on duplicate names, honors `autoDiscovery: false`. */
    protected discoverDefinitions<TDefinition extends {
        name: string;
    }>(opts: {
        read: (modelClass: TClass<unknown>) => TDefinition | undefined;
        kind: string;
    }): Record<string, TDefinition>;
}
```

Source: `packages/kernel/src/base/datasources/abstract.ts`

## `AbstractEntity`

*class*

Engine-neutral entity root: named, scoped-logged, zod-schema-capable.

```ts
export declare abstract class AbstractEntity<Schema = unknown> extends BaseHelper {
    name: string;
    constructor(opts: {
        name: string;
    });
    abstract getSchema<T = Schema>(opts: {
        type: TSchemaType;
    }): T;
    /** Path-param id shape for this entity - default 'string' (every document-family id, e.g. Typesense's). */
    getIdType(): TIdSchemaType;
    /** Keys the server fills on every write, which a generated create or update body leaves out. None here. */
    getServerStampedKeys(): string[];
    toObject(): this;
    toJSON(): this;
}
```

Source: `packages/kernel/src/base/models/base.ts`

## `AbstractRepository`

*class*

Engine-neutral repository plumbing - lazy dataSource/entity resolution, class-keyed `@model`
settings, operation scope. `TOptions` defaults to `IExtraOptions` so connectors can narrow it
while staying assignable to this base.

```ts
export declare abstract class AbstractRepository<TDataObject extends object, TPersistObject extends object = TDataObject, TOptions extends IExtraOptions = IExtraOptions> extends BaseHelper implements IPersistableRepository<TDataObject, TPersistObject, TOptions> {
    protected _operationScope: TRepositoryOperationScope;
    /** Lazy-resolved on first access if not provided in constructor. */
    protected _dataSource?: AbstractDataSource;
    /** Lazy-resolved from @repository metadata on first access. */
    protected _entity?: AbstractEntity;
    /**
     * Memoized @model settings for `this.entity`'s class. `null` means not yet resolved - `undefined`
     * is itself a valid resolved value: the model declares no settings.
     */
    private _modelSettings;
    constructor(dataSource?: AbstractDataSource, opts?: {
        scope?: string;
        entityClass?: TClass<AbstractEntity>;
        operationScope?: TRepositoryOperationScope;
    });
    get dataSource(): AbstractDataSource;
    set dataSource(value: AbstractDataSource);
    /** Auto-resolves from @repository metadata if not explicitly set. */
    get entity(): AbstractEntity;
    set entity(value: AbstractEntity);
    get operationScope(): TRepositoryOperationScope;
    setDataSource(opts: {
        dataSource: AbstractDataSource;
    }): void;
    getEntity(): AbstractEntity;
    /**
     * Resolved `@model` settings for `this.entity`'s class, keyed by Reflect target - not by
     * `entity.name`, which can diverge from the `@model` registry key.
     */
    protected get modelSettings(): IModelMetadata['settings'];
    protected get hiddenFields(): string[];
    /**
     * Refuses (400, `Column NOT FOUND`) a filter that came from a request and names a field the model hides, in its
     * `where`, its `order` or the `scope` of an `include` (judged by the hidden fields of the model it reads). The generated
     * controllers call it on what a client sends; the repository's own verbs do not, so server code can still filter and
     * sort on a hidden field.
     */
    assertRequestFilter(opts: {
        filter?: IRequestFilterShape;
    }): void;
    /**
     * How this repository judges the keys of a request filter. The default reads a key as a dotted field name and refuses it with
     * a 400 `Column NOT FOUND`; a relational or a search repository overrides it to read keys as its own query does and to
     * refuse with its own query's error for a column that does not exist.
     */
    protected createRequestFilterJudge(): IRequestFilterJudge;
    /** Default where from @model settings.query.filter.where, AND-merged into every query unless skipped. */
    protected get defaultWhere(): TWhere | undefined;
    protected get defaultLimit(): number | undefined;
    /** Largest `limit` a caller may ask for, when the model declares one; undefined leaves the tier's own default in force. */
    protected get maxLimit(): number | undefined;
    /**
     * Both bounds, in one place, for every tier.
     *
     * The upper bound is the point: `@model({ settings: { query: { limit: { max } } } })` is public and validated at
     * decoration time, but the relational tier read it nowhere, so `limit.max: 2` still issued
     * `LIMIT 50000000`.
     *
     * The lower bound matters just as much and is easy to miss: a NEGATIVE limit is not a smaller
     * page. Drizzle renders the LIMIT clause only when the value is `>= 0`, so a negative one removes
     * the clause and returns the whole table. The wire schema now rejects it too, but a server-side
     * caller reaches this method without passing through the schema at all.
     */
    protected assertLimitWithinCeiling(opts: {
        limit?: number;
        scope?: string;
    }): void;
    /**
     * The whole filter, relations included. Checking only the top-level `limit` left the identical
     * defect reachable one level down: a relation scope's negative limit drops Drizzle's LIMIT clause
     * for that relation and loads the entire related table.
     *
     * A relation's limit gets the SHAPE check only, not a ceiling. The ceiling belongs to the
     * relation's own model, which this repository cannot resolve - claiming otherwise would enforce
     * the parent's `limit.max` on a different entity.
     */
    protected assertFilterLimits(opts: {
        filter?: TFilter;
        scope?: string;
    }): void;
    /** Resolves the entity instance from @repository metadata on first access. */
    protected resolveEntity(): AbstractEntity;
    /** Rejects a verb the current operation scope does not permit. */
    protected denyOperation(opts: {
        methodName: string;
    }): never;
    /**
     * Shared retry orchestration for read verbs. Inside a transaction retry is skipped - the pool
     * routes transactions to the primary, so there is no replica lag to wait out.
     */
    protected executeReadWithRetry<TResult>(opts: {
        operation: string;
        options: IExtraOptions & IWithReadRetry<TResult>;
        defaultUntil: (result: TResult) => boolean;
        execution: () => Promise<TResult>;
    }): Promise<TResult>;
    /**
     * A copy of `options` without `retry`, so re-entering a read verb takes its non-retry path - this
     * is what keeps the retry recursion single-depth. Copy-then-delete rather than a rest-destructure
     * (lint rejects the unused rest sibling) or `lodash/omit` (its `Omit<>` return type is not
     * assignable back to `TOptions`).
     */
    private omitReadRetry;
    /** `find`, re-executed until the retry predicate holds - connectors dispatch here from `find` when `options.retry` is set. */
    protected findUntil<R = TDataObject>(opts: {
        filter: TFilter<TDataObject>;
        options: TFindOptions<TOptions, R>;
    }): Promise<Array<R>>;
    /** `find` with the range envelope, re-executed until the retry predicate holds - split from `findUntil` so each result shape is checked against its own `find` overload. */
    protected findRangeUntil<R = TDataObject>(opts: {
        filter: TFilter<TDataObject>;
        options: TFindRangeOptions<TOptions, R>;
    }): Promise<TDataWithRange<R>>;
    /** `findOne`, re-executed until the retry predicate holds - also serves `findById` via its findOne delegation. */
    protected findOneUntil<R = TDataObject>(opts: {
        filter: TFilter<TDataObject>;
        options: TFindOneOptions<TOptions, R>;
    }): Promise<TNullable<R>>;
    abstract count(opts: {
        where: TWhere<TDataObject>;
        options?: TOptions;
    }): Promise<TCount>;
    abstract existsWith(opts: {
        where: TWhere<TDataObject>;
        options?: TOptions;
    }): Promise<boolean>;
    abstract find<R = unknown, const F extends TFields<TDataObject> = TFields<TDataObject>>(opts: {
        filter: TFilter<TDataObject, F>;
        options: TFindRangeOptions<TOptions, TRow<TDataObject, R, F>>;
    }): Promise<TDataWithRange<TRow<TDataObject, R, F>>>;
    abstract find<R = unknown, const F extends TFields<TDataObject> = TFields<TDataObject>>(opts: {
        filter: TFilter<TDataObject, F>;
        options?: TFindOptions<TOptions, TRow<TDataObject, R, F>>;
    }): Promise<Array<TRow<TDataObject, R, F>>>;
    abstract findOne<R = unknown, const F extends TFields<TDataObject> = TFields<TDataObject>>(opts: {
        filter: TFilter<TDataObject, F>;
        options?: TFindOneOptions<TOptions, TRow<TDataObject, R, F>>;
    }): Promise<TNullable<TRow<TDataObject, R, F>>>;
    abstract findById<R = unknown, const F extends TFields<TDataObject> = TFields<TDataObject>>(opts: {
        id: IdType;
        filter?: TByIdFilter<TDataObject, F>;
        options?: TFindOneOptions<TOptions, TRow<TDataObject, R, F>>;
    }): Promise<TNullable<TRow<TDataObject, R, F>>>;
    abstract create(opts: {
        data: TPersistObject;
        options: TOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract create<R = TDataObject>(opts: {
        data: TPersistObject;
        options?: TOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    abstract createAll(opts: {
        data: Array<TPersistObject>;
        options: TOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract createAll<R = TDataObject>(opts: {
        data: Array<TPersistObject>;
        options?: TOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    abstract updateById(opts: {
        id: IdType;
        data: Partial<TPersistObject>;
        options: TOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract updateById<R = TDataObject>(opts: {
        id: IdType;
        data: Partial<TPersistObject>;
        options?: TOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    abstract updateAll(opts: {
        data: Partial<TPersistObject>;
        where: TWhere<TDataObject>;
        options: TOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract updateAll<R = TDataObject>(opts: {
        data: Partial<TPersistObject>;
        where: TWhere<TDataObject>;
        options?: TOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
    /** Alias for updateAll. */
    updateBy(opts: {
        data: Partial<TPersistObject>;
        where: TWhere<TDataObject>;
        options: TOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateBy<R = TDataObject>(opts: {
        data: Partial<TPersistObject>;
        where: TWhere<TDataObject>;
        options?: TOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
    abstract deleteById(opts: {
        id: IdType;
        options: TOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract deleteById<R = TDataObject>(opts: {
        id: IdType;
        options?: TOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    abstract deleteAll(opts: {
        where?: TWhere<TDataObject>;
        options: TOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract deleteAll<R = TDataObject>(opts: {
        where?: TWhere<TDataObject>;
        options?: TOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
    /** Alias for deleteAll. */
    deleteBy(opts: {
        where: TWhere<TDataObject>;
        options: TOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteBy<R = TDataObject>(opts: {
        where: TWhere<TDataObject>;
        options?: TOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
}
```

Source: `packages/kernel/src/base/repositories/core/abstract.ts`

## `CoreErrorCodes`

*class*

Framework-level failures that are not specific to one connector or component.

```ts
export declare class CoreErrorCodes {
    static readonly NOT_SUPPORTED: string;
    static readonly DATABASE_CONFLICT: string;
}
```

Source: `packages/kernel/src/common/error-codes.ts`

## `DataRangeUtility`

*class*

The `Content-Range` of a page: building the range from a result, and writing it as a header value.

```ts
export declare class DataRangeUtility {
    /** Content-Range envelope with an inclusive `end` - an empty page collapses `end` onto `start`. */
    static buildDataRange(opts: {
        skip?: number;
        offset?: number;
        dataLength: number;
        total: number;
    }): TDataRange;
    /** `Content-Range` of a page: inclusive `end`, and `records * /<total>` (no space) when the page is empty. Exported so a route that writes the header itself uses the one formatter. */
    static toContentRange(opts: {
        range: TDataRange;
        count: number;
    }): string;
}
```

Source: `packages/kernel/src/base/repositories/common/types/results.ts`

## `DEFAULT_LIMIT`

*const*

Default pagination limit for repository queries.

```ts
export declare const DEFAULT_LIMIT = 10;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `DEFAULT_MAX_LIMIT`

*const*

Largest `limit` a caller may ask for when a model declares no `query.limit.max`.

POLICY, not capacity - it sits far below what an engine can physically serve. It exists because
removing an accidental guardrail without replacing it would leave the framework less safe than
before: a search engine refused a page over 250 hits, so `limit: 5000` failed fast and cheap.
Once that page is served, something has to decide when a page is unreasonable.

1000 sits above any list screen and well below the physical ceiling, so reaching it means the
caller is doing something unusual - and a model raises it by saying so explicitly.

```ts
export declare const DEFAULT_MAX_LIMIT = 1000;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `HttpExtraRequest`

*class*

The client half of the list-extras contract: what goes in `x-request-extra`.

```ts
export declare class HttpExtraRequest {
    /**
     * The header value for what a call asks for - `name`, `-name`, `name(key,key)` - led by `-*` when
     * the call wants the rows alone, every default off. `undefined` when it asks for nothing.
     */
    static toHeader(opts: {
        extra?: TExtraRequest;
        isEveryDefaultOff?: boolean;
    }): string | undefined;
    /** The header name, for a client that sets headers itself. */
    static readonly HEADER: "x-request-extra";
}
```

Source: `packages/kernel/src/base/repositories/common/extra-request.ts`

## `HttpResponseReader`

*class*

What an IGNIS server answers - `Content-Range`, the error envelope - read once, here, for every
client of that server: the http connector, and a client that reads it without the connector.

```ts
export declare class HttpResponseReader {
    static isPlainObject(value: unknown): value is Record<string, unknown>;
    /** An empty string reads as absent, so a fallback still applies. */
    static toText(value: unknown): string | undefined;
    /**
     * A `Content-Range` header as the IGNIS server writes it: `records 0-24/137` -> skip 0, total 137;
     * an empty page, `records *\/137` -> total 137. Anything else, including an absent header or an
     * unknown total, is `undefined`.
     */
    static parseContentRange(opts: {
        header?: string | null;
    }): {
        skip?: number;
        total: number;
    } | undefined;
    /**
     * The IGNIS error envelope - `{ message, statusCode, normalized: { text, code, args }, requestId,
     * extra, details }` - read off a parsed response body. A server configured with `error.rootKey`
     * wraps it under that key; pass the same `rootKey` to unwrap it. A body without that key, or with a
     * non-object under it (a proxy's `{ error: 'Bad Gateway' }`), is read as it stands.
     *
     * A body that is not a plain object yields `{}`; any other body yields its known fields, each
     * `undefined` when absent or mistyped. An empty string reads as absent.
     */
    static readErrorEnvelope(opts: {
        body: unknown;
        rootKey?: string;
    }): TResponsedError;
    /** A failed response's envelope. A body that is not JSON yields `{}`, and the status alone still describes it. */
    static readError(opts: {
        response: Response;
        rootKey?: string;
    }): Promise<TResponsedError>;
    /**
     * A failed response as the error the server threw: its status, code, args and text, and its
     * `extra` with the `requestId` added. `message` is `context` plus the server's text, for logs;
     * `normalized.text` stays the server's, for display - `HTTP <status>` when the server sent none.
     * `cause` is the server's `details.cause` - a 422's per-field issues, `{ path, message, code }`.
     *
     * `requestId` names the request this client made. A relaying server's `extra` carries the id of
     * the request it made upstream: it joins `upstreamRequestIds`, nearest first, at every hop.
     */
    static toApplicationError(opts: {
        response: Response;
        /** Where it failed, for logs - e.g. `[HttpDataSource][read] 404 | /tickets`. */
        context: string;
        rootKey?: string;
    }): Promise<ApplicationError>;
    /**
     * A body the server marked with `x-response-extra` carries `extra` beside its rows. `body` is what
     * the route answers without extras: the `{ count, data }` envelope when the count was asked for in
     * the body, the rows otherwise. Any other body is returned as it stands - an unmarked object is
     * never unwrapped, so a row that has `data` and `extra` columns of its own is never misread.
     */
    static readExtra(opts: {
        body: unknown;
        headers: Pick<Headers, 'has'>;
    }): {
        body: unknown;
        extra?: Record<string, unknown>;
    };
}
```

Source: `packages/kernel/src/base/repositories/common/response-reader.ts`

## `ICreatableRepository`

*interface*

Interface for create operations.

```ts
export interface ICreatableRepository<TDataObject extends object = object, TPersistObject extends object = TDataObject, ExtraOptions extends IExtraOptions = IExtraOptions> extends IRepository {
    create(opts: {
        data: TPersistObject;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    create<R = TDataObject>(opts: {
        data: TPersistObject;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    createAll(opts: {
        data: Array<TPersistObject>;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    createAll<R = TDataObject>(opts: {
        data: Array<TPersistObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
}
```

Source: `packages/kernel/src/base/repositories/common/types/contracts.ts`

## `ICrudRepository`

*interface*

Alias for IPersistableRepository - the name both DefaultRelationalRepository and
DefaultSearchRepository satisfy.

```ts
export interface ICrudRepository<TDataObject extends object = object, TPersistObject extends object = TDataObject, ExtraOptions extends IExtraOptions = IExtraOptions> extends IPersistableRepository<TDataObject, TPersistObject, ExtraOptions> {
}
```

Source: `packages/kernel/src/base/repositories/common/types/contracts.ts`

## `IDataSource`

*interface*

Engine-neutral datasource contract - the root every connector family implements.

```ts
export interface IDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}> extends IConfigurable<ConfigurableOptions> {
    name: string;
    settings: Settings;
    schema: Schema;
    getSettings(): Settings;
    getSchema(): Schema;
    /** Releases what `configure()` opened. `stop()` calls it on every datasource the boot configured. */
    close?(): Promise<void>;
    /** The datasource's own `configure()` receives the handles of {@link IDataSourceOpening} as its second argument. */
    configure(opts?: ConfigurableOptions, opening?: IDataSourceOpening): ValueOrPromise<void>;
    /** The handles `configure()` is given: the boot passes them in every mode, so the same body works whether the datasource opens at start or on first use. */
    getOpening?(): IDataSourceOpening;
    /** True when the datasource opens on first use (`@datasource({ open: { on: 'first-use' } })`): the boot then calls {@link deferOpen} instead of `configure()`. */
    isOpenDeferred?(): boolean;
    /** Records the options `configure()` will get when the datasource opens on first use; nothing is opened. */
    deferOpen?(opts: {
        options?: object;
    }): void;
    /** Resolves once the datasource is open: at once when it opens with the application or is already open, else after the one open that the first use starts. */
    ensureOpen?(): Promise<void>;
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `IDeletableRepository`

*interface*

Interface for delete operations.

```ts
export interface IDeletableRepository<TDataObject extends object = object, ExtraOptions extends IExtraOptions = IExtraOptions> extends IRepository {
    deleteById(opts: {
        id: IdType;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteById<R = TDataObject>(opts: {
        id: IdType;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    deleteAll(opts: {
        where?: TWhere<TDataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteAll<R = TDataObject>(opts: {
        where?: TWhere<TDataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
    /** Alias for deleteAll. */
    deleteBy(opts: {
        where?: TWhere<TDataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    /** Alias for deleteAll. */
    deleteBy<R = TDataObject>(opts: {
        where?: TWhere<TDataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
}
```

Source: `packages/kernel/src/base/repositories/common/types/contracts.ts`

## `IPersistableRepository`

*interface*

Interface for full CRUD repository operations - reads plus create, update, and delete.

```ts
export interface IPersistableRepository<TDataObject extends object = object, TPersistObject extends object = TDataObject, ExtraOptions extends IExtraOptions = IExtraOptions> extends IReadableRepository<TDataObject, ExtraOptions>, ICreatableRepository<TDataObject, TPersistObject, ExtraOptions>, IUpdatableRepository<TDataObject, TPersistObject, ExtraOptions>, IDeletableRepository<TDataObject, ExtraOptions> {
}
```

Source: `packages/kernel/src/base/repositories/common/types/contracts.ts`

## `IReadableRepository`

*interface*

Interface for read-only repository operations. `TDataObject` is the row/document shape itself.

```ts
export interface IReadableRepository<TDataObject extends object = object, ExtraOptions extends IExtraOptions = IExtraOptions> extends IRepository {
    count(opts: {
        where: TWhere<TDataObject>;
        options?: ExtraOptions;
    }): Promise<TCount>;
    existsWith(opts: {
        where: TWhere<TDataObject>;
        options?: ExtraOptions;
    }): Promise<boolean>;
    find<R = unknown, const F extends TFields<TDataObject> = TFields<TDataObject>>(opts: {
        filter: TFilter<TDataObject, F>;
        options: TFindRangeOptions<ExtraOptions, TRow<TDataObject, R, F>>;
    }): Promise<TDataWithRange<TRow<TDataObject, R, F>>>;
    find<R = unknown, const F extends TFields<TDataObject> = TFields<TDataObject>>(opts: {
        filter: TFilter<TDataObject, F>;
        options?: TFindOptions<ExtraOptions, TRow<TDataObject, R, F>>;
    }): Promise<Array<TRow<TDataObject, R, F>>>;
    findOne<R = unknown, const F extends TFields<TDataObject> = TFields<TDataObject>>(opts: {
        filter: TFilter<TDataObject, F>;
        options?: TFindOneOptions<ExtraOptions, TRow<TDataObject, R, F>>;
    }): Promise<TNullable<TRow<TDataObject, R, F>>>;
    findById<R = unknown, const F extends TFields<TDataObject> = TFields<TDataObject>>(opts: {
        id: IdType;
        filter?: TByIdFilter<TDataObject, F>;
        options?: TFindOneOptions<ExtraOptions, TRow<TDataObject, R, F>>;
    }): Promise<TNullable<TRow<TDataObject, R, F>>>;
}
```

Source: `packages/kernel/src/base/repositories/common/types/contracts.ts`

## `IRepository`

*interface*

Base repository interface shared by every engine - engine-specific accessors (postgres's
`getEntitySchema()`/`getConnector()`) stay on the connector's own repository tier.

```ts
export interface IRepository {
    dataSource: AbstractDataSource;
    entity: AbstractEntity;
    getEntity(): AbstractEntity;
}
```

Source: `packages/kernel/src/base/repositories/common/types/contracts.ts`

## `IUpdatableRepository`

*interface*

Interface for update operations.

```ts
export interface IUpdatableRepository<TDataObject extends object = object, TPersistObject extends object = TDataObject, ExtraOptions extends IExtraOptions = IExtraOptions> extends IRepository {
    updateById(opts: {
        id: IdType;
        data: Partial<TPersistObject>;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateById<R = TDataObject>(opts: {
        id: IdType;
        data: Partial<TPersistObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    updateAll(opts: {
        data: Partial<TPersistObject>;
        where: TWhere<TDataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateAll<R = TDataObject>(opts: {
        data: Partial<TPersistObject>;
        where: TWhere<TDataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
    /** Alias for updateAll. */
    updateBy(opts: {
        data: Partial<TPersistObject>;
        where: TWhere<TDataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    /** Alias for updateAll. */
    updateBy<R = TDataObject>(opts: {
        data: Partial<TPersistObject>;
        where: TWhere<TDataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
}
```

Source: `packages/kernel/src/base/repositories/common/types/contracts.ts`

## `NotSupportedUtility`

*class*

Errors an implementation raises on purpose.

```ts
export declare class NotSupportedUtility {
    /** Standardized NotSupported error (HTTP 501) for a capability an implementation deliberately does not provide - logs a warning before throwing so the gap shows in operational logs, not just to the caller. */
    static throwNotSupported(opts: {
        scope: string;
        feature: string;
        logger: ILogger;
    }): never;
}
```

Source: `packages/kernel/src/utilities/not-supported.utility.ts`

## `RepositoryOperationScopes`

*class*

Defines the operation scope for repository instances (READ_ONLY, WRITE_ONLY, READ_WRITE).

```ts
export declare class RepositoryOperationScopes {
    static readonly READ_ONLY = "READ_ONLY";
    static readonly WRITE_ONLY = "WRITE_ONLY";
    static readonly READ_WRITE = "READ_WRITE";
    static readonly SCHEME_SET: Set<string>;
    static isValid(orgType: string): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `RepositoryTypes`

*class*

What `@repository` binds: MODEL, a model this application declares; REMOTE, data behind another service's API, with no model.

```ts
export declare class RepositoryTypes {
    static readonly MODEL = "model";
    static readonly REMOTE = "remote";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `SchemaTypes`

*class*

The schema variants an entity can produce (`getSchema({ type })`): select, create, update and execute.

```ts
export declare class SchemaTypes {
    static readonly SELECT = "select";
    static readonly UPDATE = "update";
    static readonly CREATE = "create";
    static readonly EXECUTE = "execute";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TSchemaType;
}
```

Source: `packages/kernel/src/base/models/common/constants.ts`

## `SearchErrorCodes`

*class*

Failures raised by the search connectors (Typesense, Meilisearch) and the neutral search tier.

```ts
export declare class SearchErrorCodes {
    static readonly NOT_FOUND: string;
    static readonly ALREADY_EXISTS: string;
    static readonly TASK_TIMEOUT: string;
    static readonly DEPENDENCY_UNAVAILABLE: string;
}
```

Source: `packages/kernel/src/common/error-codes.ts`

## `TCount`

*type*

The count envelope. Spelled out rather than inferred from `CountSchema`, which lives in `result-schemas.ts` - inferring it here would put zod on every path that needs the TYPE.

```ts
export type TCount = {
    count: number;
};
```

Source: `packages/kernel/src/base/repositories/common/types/results.ts`

## `TDataRange`

*type*

Data range information for paginated queries. Follows HTTP Content-Range standard.

```ts
export type TDataRange = {
    start: number;
    end: number;
    total: number;
};
```

Source: `packages/kernel/src/base/repositories/common/types/results.ts`

## `TDataWithRange`

*type*

The `shouldQueryRange: true` result envelope; `extra` carries what a list answered beside its rows - see `x-request-extra`.

```ts
export type TDataWithRange<R> = {
    data: Array<R>;
    range: TDataRange;
    extra?: Record<string, unknown>;
};
```

Source: `packages/kernel/src/base/repositories/common/types/results.ts`

## `TExtraRequest`

*type*

The extras a client asks for, by name: `true` asks for a plain extra, a list of keys asks for a
group (`facets: ['status', 'tag']`), `false` switches a default off.

```ts
export type TExtraRequest = Record<string, boolean | ReadonlyArray<string>>;
```

Source: `packages/kernel/src/base/repositories/common/extra-request.ts`

## `TExtraResult`

*type*

What may come back for `Extra`: a group keyed by the keys asked for. Every entry is optional - a
route that offers no extras, or an older server, answers none - and the route may add defaults.

```ts
export type TExtraResult<Extra extends TExtraRequest> = {
    [K in keyof Extra as Extra[K] extends false ? never : K]?: Extra[K] extends ReadonlyArray<infer Key extends string> ? Record<Key, unknown> : unknown;
} & Record<string, unknown>;
```

Source: `packages/kernel/src/base/repositories/common/extra-request.ts`

## `TIdSchemaType`

*type*

Valid id schema type values.

```ts
export type TIdSchemaType = TConstValue<typeof IdSchemaTypes>;
```

Source: `packages/kernel/src/base/models/common/constants.ts`

## `TRepositoryType`

*type*

Valid repository type values.

```ts
export type TRepositoryType = TConstValue<typeof RepositoryTypes>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TSchemaType`

*type*

Valid `SchemaTypes` values.

```ts
export type TSchemaType = TConstValue<typeof SchemaTypes>;
```

Source: `packages/kernel/src/base/models/common/constants.ts`

## Re-exported

- `TByIdFilter` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TFields` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TFilter` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TInclusion` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TRow` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TSelectedRow` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TWhere` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
