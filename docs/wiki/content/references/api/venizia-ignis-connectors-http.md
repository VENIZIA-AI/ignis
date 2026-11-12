---
title: "@venizia/ignis-connectors/http"
description: "Every export of @venizia/ignis-connectors/http, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/http`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

20 exports, 20 with TSDoc. 3 more are re-exported from other entries (listed at the end).

## `HttpDataSource`

*class*

Reads an IGNIS REST server through the repository contract. Targets IGNIS, not any REST API.

```ts
export declare class HttpDataSource extends DataSourceRoot<IHttpDataSourceSettings> {
    name: string;
    settings: IHttpDataSourceSettings;
    schema: never;
    /** Normalised once: every request copies these, never re-parses `settings.headers`. */
    protected configuredHeaders: Array<[string, string]>;
    /** Decided once: a relative baseUrl (`/api`) is resolved against the page origin on every request. */
    protected isRelativeBaseUrl: boolean;
    constructor(opts: IHttpDataSourceSettings & {
        name?: string;
    });
    configure(): Promise<void>;
    getCapabilities(): {
        transactions: boolean;
    };
    protected resolveAuthToken(opts: {
        context: IHttpRequestContext;
    }): IAuthToken | undefined;
    /** Re-run on every send, so a header the app changed since the last request is the one sent. */
    protected resolveHeaders(opts: {
        context: IHttpRequestContext;
    }): Array<[string, string]>;
    protected buildHeaders(opts: {
        token?: IAuthToken;
        requestHeaders?: Array<[string, string]>;
        isJsonBody?: boolean;
        isFormDataBody?: boolean;
    }): Headers;
    /** The browser global `location` is not declared for a server build, so it is probed, not assumed. */
    protected resolveLocationOrigin(): string | undefined;
    /** The path as an error message quotes it: cut at 200 characters, with an ellipsis. */
    protected static toEchoedPath(opts: {
        path: string;
    }): string;
    /** The request paths name a place under the base path, so none may be a dot segment, hide one, or carry a separator the URL parser would read differently from a server. */
    protected assertPathsStayUnderBase(opts: {
        paths: Array<string>;
    }): void;
    /** The resolved URL, whatever built it, is on the base's origin and under its path: the check that holds when the text checks above miss a form. */
    protected assertUnderBase(opts: {
        url: URL;
        origin?: string;
    }): void;
    buildUrl(opts: {
        paths: Array<string>;
        query?: Record<string, unknown>;
    }): string;
    /**
     * The raw `Response`, on any method - for what the repository verbs do not cover, like an export
     * or a PUT to a hand-written route. Auth and the 401 retry apply; the retry resends the same body.
     */
    request(opts: {
        paths: Array<string>;
        query?: Record<string, unknown>;
        method?: string;
        body?: THttpBody;
    } & IHttpCallOptions): Promise<Response>;
    /** `request` on a URL already built: `read` and `write` serialise a long query once, not per use. */
    protected sendRequest(opts: {
        paths: Array<string>;
        url: string;
        method?: string;
        body?: THttpBody;
    } & IHttpCallOptions): Promise<Response>;
    /**
     * The body as JSON, `null` when there is none; a body that is not JSON is the server's fault, named
     * as such. Its content stays out of the message, which a relaying server may pass to its clients.
     */
    protected readJsonBody(opts: {
        response: Response;
        url: string;
        verb: string;
    }): Promise<any>;
    /**
     * A failed response as the error the server threw: its status, code, args and text, and its
     * `extra` with the `requestId` added. `message` adds where it failed, for logs; `normalized.text`
     * stays the server's, for display - `HTTP <status>` when the server sent none. `cause` is the server's `details.cause` - a 422's per-field
     * issues, `{ path, message, code }`.
     */
    protected toResponseError(opts: {
        response: Response;
        url: string;
        verb: string;
    }): Promise<import("@venizia/ignis-inversion").ApplicationError>;
    /**
     * Rows plus the total from `Content-Range`, reported absent when the header is. A GET unless told
     * otherwise: `method` and `body` reach a list route a service wrote to take its filter in a body.
     */
    read<R>(opts: {
        paths: Array<string>;
        query?: Record<string, unknown>;
        shape?: THttpReadShape;
        method?: string;
        body?: THttpBody;
        /** Extras the route offers beside its rows, asked for by name (`x-request-extra`). */
        extra?: TExtraRequest;
        /** The rows alone: every default extra off (`-*`), for a read that only counts or probes. */
        isEveryDefaultOff?: boolean;
    } & IHttpCallOptions): Promise<IHttpReadResult<R>>;
    /**
     * A write, and what it answered: the body as the rows, the count from `x-response-count`. The
     * connector asks for bare rows, so an IGNIS write answers the row or the rows, never the envelope.
     */
    write<R>(opts: {
        paths: Array<string>;
        query?: Record<string, unknown>;
        method: string;
        body?: THttpBody;
        /** Extras the route answers beside its rows, asked for by name (`x-request-extra`). */
        extra?: TExtraRequest;
    } & IHttpCallOptions): Promise<IHttpWriteResult<R>>;
}
```

Source: `packages/connectors/src/http/datasource.ts`

## `HttpReadShapes`

*class*

What a read expects back: LIST (a bare array or the `{ count, data }` envelope) or ONE (a single record, never unwrapped).

```ts
export declare class HttpReadShapes {
    static readonly LIST = "list";
    static readonly ONE = "one";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/connectors/src/http/common/constants.ts`

## `HttpRepository`

*class*

One remote resource, read and written through the IGNIS CRUD routes, in the `@venizia/ignis-filter`
vocabulary. `P` is what a write sends - a partial row by default, since the server fills ids and
defaults. There is no `createAll`: the IGNIS REST contract has no bulk-create route.

```ts
export declare class HttpRepository<E extends object = AnyType, P extends object = Partial<E>> implements IReadableRepository<E, THttpRepositoryOptions>, IUpdatableRepository<E, P, THttpRepositoryOptions>, IDeletableRepository<E, THttpRepositoryOptions> {
    dataSource: HttpDataSource;
    entity: AbstractEntity;
    protected resource: string;
    /** A count route, if the API has one. Absent, the total comes from `Content-Range`. */
    protected countPath?: string;
    /** The segment after the resource that names the IGNIS find-one route. Absent, `findOne` asks the list route for one row. */
    protected findOnePath?: string;
    /** The page size `find` asks for when its filter names no limit. Absent, the server's own default applies. */
    protected defaultLimit?: number;
    /**
     * The segment after the resource that names the IGNIS search route.
     *
     * @default 'search'
     */
    protected searchPath: string;
    constructor(opts: {
        dataSource: HttpDataSource;
        resource: string;
        countPath?: string;
        findOnePath?: string;
        defaultLimit?: number;
        searchPath?: string;
    });
    getEntity(): AbstractEntity;
    /**
     * The query string of a read: the caller's extra `query` with the call's own `params` (`filter`,
     * `where`) over it. `method` names the repository verb, so a subclass can reshape one route - a
     * keyword into the object its server reads - and leave the others.
     */
    protected buildQuery(opts: {
        method: string;
        query?: THttpExtraQuery;
        params: Record<string, unknown>;
    }): Record<string, unknown>;
    /** The filter `find` sends: the caller's, with `defaultLimit` filled in when it names no limit. */
    protected resolveFindFilter(opts: {
        filter?: TFilter<E>;
    }): TFilter<E>;
    /** `<resource>/<searchPath>`; override to move the route. */
    protected getSearchPaths(): Array<string>;
    /** No header and an unreadable one (`/*`) have different fixes, so different messages. */
    protected getMissingTotalError(opts: {
        method: string;
        contentRange?: string;
        noHeader: string;
    }): import("@venizia/ignis-inversion").ApplicationError;
    /** From `Content-Range`, or `countPath`. No total throws rather than reporting the page size. */
    count(opts: {
        where: TWhere<E>;
        query?: THttpExtraQuery;
        options?: THttpRepositoryOptions;
    }): Promise<TCount>;
    existsWith(opts: {
        where: TWhere<E>;
        query?: THttpExtraQuery;
        options?: THttpRepositoryOptions;
    }): Promise<boolean>;
    /** With `extra`: what the route answered beside the rows, typed by what was asked for. */
    find<R = unknown, const Extra extends TExtraRequest = TExtraRequest, const F extends TFields<E> = TFields<E>>(opts: {
        filter: TFilter<E, F>;
        query?: THttpExtraQuery;
        options: THttpRepositoryOptions & {
            shouldQueryRange: true;
            extra: Extra;
        };
    }): Promise<TDataWithRange<TRow<E, R, F>> & {
        extra: TExtraResult<Extra>;
    }>;
    find<R = unknown, const F extends TFields<E> = TFields<E>>(opts: {
        filter: TFilter<E, F>;
        query?: THttpExtraQuery;
        options: THttpRepositoryOptions & {
            shouldQueryRange: true;
        };
    }): Promise<TDataWithRange<TRow<E, R, F>>>;
    find<R = unknown, const Extra extends TExtraRequest = TExtraRequest, const F extends TFields<E> = TFields<E>>(opts: {
        filter?: TFilter<E, F>;
        query?: THttpExtraQuery;
        options: THttpRepositoryOptions & {
            extra: Extra;
        };
    }): Promise<{
        data: Array<TRow<E, R, F>>;
        extra: TExtraResult<Extra>;
    }>;
    find<R = unknown, const F extends TFields<E> = TFields<E>>(opts: {
        filter?: TFilter<E, F>;
        query?: THttpExtraQuery;
        options?: THttpRepositoryOptions;
    }): Promise<Array<TRow<E, R, F>>>;
    /** `extra` or the range decided at run time: the caller narrows the union. */
    find<R = unknown, const F extends TFields<E> = TFields<E>>(opts: {
        filter?: TFilter<E, F>;
        query?: THttpExtraQuery;
        options?: THttpRepositoryOptions & {
            shouldQueryRange?: boolean;
            extra?: TExtraRequest;
        };
    }): Promise<Array<TRow<E, R, F>> | TDataWithRange<TRow<E, R, F>> | {
        data: Array<TRow<E, R, F>>;
        extra: TExtraResult<TExtraRequest>;
    }>;
    findOne<R = unknown, const F extends TFields<E> = TFields<E>>(opts: {
        filter?: TFilter<E, F>;
        query?: THttpExtraQuery;
        options?: THttpRepositoryOptions;
    }): Promise<TRow<E, R, F> | null>;
    /** The server answers `null`, never 404, for a missing id. A `where` would be replaced by the id. */
    findById<R = unknown, const F extends TFields<E> = TFields<E>>(opts: {
        id: string | number;
        filter?: TByIdFilter<E, F>;
        query?: THttpExtraQuery;
        options?: THttpRepositoryOptions;
    }): Promise<TRow<E, R, F> | null>;
    /**
     * POST `<resource>/search`, the IGNIS search route: `input` is its body (a keyword, semantic, hybrid
     * or raw search), the answer its `{ found, isFoundExact, hits }`. `found` is the total - there is no
     * count route for a search, and `isFoundExact` says when it is an estimate.
     */
    search<R extends object = E>(opts: {
        input: TSearchInput;
        query?: THttpExtraQuery;
        options?: THttpRepositoryOptions;
    }): Promise<IHttpSearchResult<R>>;
    /**
     * `<resource>/<id>`, the id encoded: an id carrying `/` or `?` would otherwise name another route.
     * An empty, `.` or `..` id is refused: a URL resolves it, encoded or not, to `/<resource>/` or the
     * parent - a router or proxy that ignores the trailing slash then serves the list or bulk route.
     */
    protected getIdPaths(opts: {
        id: string | number;
    }): Array<string>;
    /** What a call adds to its request: headers and an abort signal. Every other option stays local. */
    protected toCallOptions(opts: {
        options?: THttpRepositoryOptions;
    }): IHttpCallOptions;
    /** The IGNIS bulk routes answer an empty `where` with a 400; refused here before a request is spent. */
    protected assertBulkWhere(opts: {
        method: string;
        where?: TWhere<E>;
    }): TWhere<E>;
    /** The server always answers the rows; `shouldReturn: false` drops them here, as a database repository would not fetch them. */
    protected toWriteResult<R>(opts: {
        result: IHttpWriteResult<R>;
        options?: THttpRepositoryOptions & {
            shouldReturn?: boolean;
        };
    }): TCount & {
        data: R | null;
    };
    /** POST `/<resource>`. */
    create<R = E>(opts: {
        data: P;
        options?: THttpRepositoryOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    updateById(opts: {
        id: string | number;
        data: Partial<P>;
        options: THttpRepositoryOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateById<R = E>(opts: {
        id: string | number;
        data: Partial<P>;
        options?: THttpRepositoryOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    updateBy(opts: {
        data: Partial<P>;
        where: TWhere<E>;
        options: THttpRepositoryOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateBy<R = E>(opts: {
        data: Partial<P>;
        where: TWhere<E>;
        options?: THttpRepositoryOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
    protected patchWhere(opts: {
        method: string;
        data: Partial<P>;
        where: TWhere<E>;
        options?: THttpRepositoryOptions & {
            shouldReturn?: boolean;
        };
    }): Promise<TCount & {
        data: AnyType;
    }>;
    deleteById(opts: {
        id: string | number;
        options: THttpRepositoryOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteById<R = E>(opts: {
        id: string | number;
        options?: THttpRepositoryOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    deleteBy(opts: {
        where: TWhere<E>;
        options: THttpRepositoryOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteBy<R = E>(opts: {
        where: TWhere<E>;
        options?: THttpRepositoryOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R> | null;
    }>;
    protected deleteWhere(opts: {
        method: string;
        where: TWhere<E>;
        options?: THttpRepositoryOptions & {
            shouldReturn?: boolean;
        };
    }): Promise<TCount & {
        data: AnyType;
    }>;
}
```

Source: `packages/connectors/src/http/repository.ts`

## `HttpResourceEntity`

*class*

A remote resource has a name but no local schema.

```ts
export declare class HttpResourceEntity extends AbstractEntity {
    getSchema<T = unknown>(_opts: {
        type: TSchemaType;
    }): T;
}
```

Source: `packages/connectors/src/http/repository.ts`

## `IAuthToken`

*interface*

A credential the HTTP datasource attaches to a request: `Authorization: <type> <value>`, and `provider`, when set, as the `x-auth-provider` header.

```ts
export interface IAuthToken {
    value: string;
    /**
     * The authorization scheme.
     *
     * @default 'Bearer'
     */
    type?: string;
    provider?: string;
}
```

Source: `packages/connectors/src/http/common/types.ts`

## `IHttpCallOptions`

*interface*

What one call may add: its own headers (they win over the configured ones) and a signal to abort it.

```ts
export interface IHttpCallOptions {
    headers?: THttpHeaders;
    signal?: AbortSignal;
}
```

Source: `packages/connectors/src/http/common/types.ts`

## `IHttpDataSourceSettings`

*interface*

Settings of the HTTP datasource: where to send, which headers and token to attach, and what to do on a 401.

```ts
export interface IHttpDataSourceSettings {
    /** An absolute URL, or a path from the page origin (`/api`). A path-relative one is refused. */
    baseUrl: string;
    /** The server's `error.rootKey`: an error envelope wrapped under it is unwrapped before it is read. */
    errorRootKey?: string;
    /** Sent on every request. `x-request-count` is refused - the connector owns it. */
    headers?: THttpHeaders;
    /**
     * Run on every send, the 401 retry included. Wins over `headers`; a call's own headers win over
     * it. `x-request-count` is refused here too; an `authorization` here stands only when no token is
     * resolved.
     */
    headersResolver?: THttpHeadersResolver;
    /** Wins over `authTokenResolver`, and is sent whatever the request. */
    authToken?: IAuthToken;
    /** Run on every send, the 401 retry included. */
    authTokenResolver?: TAuthTokenResolver;
    /** Runs on a 401: `true` retries once (re-resolving the token), `false` lets the 401 stand. */
    onUnauthorized?: (context: IHttpRequestContext) => Promise<boolean> | boolean;
    /** What sends a request: the platform `fetch` when unset. Name one to route through a test double, a proxy or an instrumented client. */
    fetch?: THttpFetch;
}
```

Source: `packages/connectors/src/http/common/types.ts`

## `IHttpReadResult`

*interface*

A list with no `Content-Range` has no total - `hasRange` says so rather than using the page size.

```ts
export interface IHttpReadResult<R> {
    data: R;
    hasRange: boolean;
    /** Raw header: tells a present-but-unreadable one from an absent one. */
    contentRange?: string;
    total?: number;
    skip?: number;
    dataLength: number;
    /** What a list answered beside its rows, when the server marked it with `x-response-extra`. */
    extra?: Record<string, unknown>;
}
```

Source: `packages/connectors/src/http/common/types.ts`

## `IHttpRequestContext`

*interface*

The request a hook is asked about: the repository `paths`, the method, and the final URL with its query.

```ts
export interface IHttpRequestContext {
    paths: Array<string>;
    method: string;
    url: string;
    /** The call's own signal: a hook may stop waiting on it. A refresh shared by other calls should not be aborted by one. */
    signal?: AbortSignal;
}
```

Source: `packages/connectors/src/http/common/types.ts`

## `IHttpSearchResult`

*interface*

What the IGNIS search route answers: the total as `found` (`isFoundExact` is false when it is an estimate) and the hits.

```ts
export interface IHttpSearchResult<R> {
    found: number;
    isFoundExact: boolean;
    hits: Array<{
        document: R;
        score?: number;
        highlight?: unknown;
        highlights?: Array<unknown>;
    }>;
}
```

Source: `packages/connectors/src/http/common/types.ts`

## `IHttpWriteResult`

*interface*

What a write answers: the rows the server returned, and its `x-response-count`.

```ts
export interface IHttpWriteResult<R> {
    data: R;
    count: number;
    /** What the route answered beside the rows, when the server marked it with `x-response-extra`. */
    extra?: Record<string, unknown>;
}
```

Source: `packages/connectors/src/http/common/types.ts`

## `TAuthTokenResolver`

*type*

`undefined` means no token for this request. A throw fails the request with that error.

```ts
export type TAuthTokenResolver = (context: IHttpRequestContext) => IAuthToken | undefined;
```

Source: `packages/connectors/src/http/common/types.ts`

## `THttpBody`

*type*

A request body. A plain object or array goes out as JSON; a string, `Blob`, `FormData`,
`URLSearchParams`, `ArrayBuffer` or typed array goes out as it is. Never a stream: the 401 retry
sends the same body twice.

```ts
export type THttpBody = string | object;
```

Source: `packages/connectors/src/http/common/types.ts`

## `THttpExtraQuery`

*type*

Query parameters a route takes beside `filter` or `where` - a keyword, a scope. The filter and `where` win over a key of the same name.

```ts
export type THttpExtraQuery = Record<string, unknown>;
```

Source: `packages/connectors/src/http/common/types.ts`

## `THttpFetch`

*type*

The part of `fetch` the data source uses: a URL and its init, a `Response` back.

```ts
export type THttpFetch = (url: string, init: RequestInit) => Promise<Response>;
```

Source: `packages/connectors/src/http/common/types.ts`

## `THttpHeaders`

*type*

Not `Record` alone: header names are case-insensitive, and an object merge appends two spellings.

```ts
export type THttpHeaders = Headers | Array<[string, string]> | Record<string, string>;
```

Source: `packages/connectors/src/http/common/types.ts`

## `THttpHeadersResolver`

*type*

Headers for this request. A throw fails the request with that error.

```ts
export type THttpHeadersResolver = (context: IHttpRequestContext) => THttpHeaders | undefined;
```

Source: `packages/connectors/src/http/common/types.ts`

## `THttpQuery`

*type*

The query a repository call sends: an optional `filter` typed against the entity `E`.

```ts
export type THttpQuery<E extends object> = {
    filter?: TFilter<E>;
};
```

Source: `packages/connectors/src/http/common/types.ts`

## `THttpReadShape`

*type*

Valid HTTP read shape values.

```ts
export type THttpReadShape = TConstValue<typeof HttpReadShapes>;
```

Source: `packages/connectors/src/http/common/constants.ts`

## `THttpRepositoryOptions`

*type*

What a repository call takes. Only `headers` and `signal` cross HTTP; the shared repository
options (`transaction`, `log`, ...) are accepted for the common contract and have no effect.

```ts
export type THttpRepositoryOptions = NonNullable<Parameters<IReadableRepository['existsWith']>[0]['options']> & IHttpCallOptions;
```

Source: `packages/connectors/src/http/repository.ts`

## Re-exported

- `HttpResponseReader` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TExtraRequest` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TExtraResult` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
