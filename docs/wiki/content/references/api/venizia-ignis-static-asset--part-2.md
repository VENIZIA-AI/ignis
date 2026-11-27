---
title: "@venizia/ignis/static-asset (2 of 3)"
description: "Every export of @venizia/ignis/static-asset, from the built declarations (generated)."
---

# `@venizia/ignis/static-asset (2 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 3 of [`@venizia/ignis/static-asset`](/references/api/venizia-ignis-static-asset).

## `StaticAssetControllerFactory`

*class*

Builds the REST controller class for a static asset entry.

```ts
export declare class StaticAssetControllerFactory {
    /** Resolves the entry, then builds its controller. */
    static build<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema>(opts: IStaticAssetControllerOptions<Schema>): {
        new (): {
            binding(): ValueOrPromise<void>;
            measure<R>(opts: {
                scope: string;
                args: unknown;
                task: () => Promise<R>;
            }): Promise<R>;
            normalizeCountData<ResponseSchema, RequestContext extends import("@venizia/ignis-kernel").TRouteContext<import("hono").Env> = import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>, ResponseData extends {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<ResponseSchema>;
            } = {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<ResponseSchema>;
            }>(opts: {
                context: RequestContext;
                payload: ResponseData;
            }): ResponseData | import("@venizia/ignis-inversion").TNullable<ResponseSchema>;
            getRequestedExtras(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
            }): Array<import("@venizia/ignis-kernel").IRequestedExtra>;
            respond<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra?: never;
            }): import("@venizia/ignis-inversion").TNullable<R | {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
            }>;
            respond<R, Extra extends Record<string, import("@venizia/ignis-kernel").TResponseExtra>>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra: Extra;
            }): Promise<import("@venizia/ignis-inversion").TNullable<R | {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
            } | {
                count?: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
                extra: Partial<Record<keyof Extra, unknown>>;
            }>>;
            respond<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra?: Record<string, import("@venizia/ignis-kernel").TResponseExtra>;
            }): ValueOrPromise<import("@venizia/ignis-inversion").TNullable<R | {
                count?: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
                extra?: Record<string, unknown>;
            }>>;
            respondWithExtra<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                extra: Record<string, import("@venizia/ignis-kernel").TResponseExtra>;
            }): Promise<R | {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
            } | {
                count: number;
                data: import("@venizia/ignis-inversion").TNullable<R>;
                extra: Record<string, unknown>;
            } | {
                data: import("@venizia/ignis-inversion").TNullable<R>;
                extra: Record<string, unknown>;
                count?: undefined;
            } | null | undefined>;
            setListHeaders(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                count: number;
            } & ({
                range: import("@venizia/ignis-kernel").TDataRange;
            } | {
                offset: number;
                total: number;
            })): void;
            toHonoHandler<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig = import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                handler: (context: import("@venizia/ignis-kernel").TContextOf<RouteConfig, import("hono").Env>) => ValueOrPromise<Response | import("hono").TypedResponse<unknown>>;
            }): import("hono").Handler<import("hono").Env, string, import("hono").Input, (Response | Promise<Response>) | (import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig> | Promise<import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig>>)>;
            bindRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): import("@venizia/ignis-kernel").IBindRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            defineRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
                handler: (context: import("@venizia/ignis-kernel").TContextOf<RouteConfig, import("hono").Env>) => ValueOrPromise<Response | import("hono").TypedResponse<unknown>>;
                hook?: import("@hono/zod-openapi").Hook<any, import("hono").Env, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            defineJSXRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
                handler: (context: import("@venizia/ignis-kernel").TContextOf<RouteConfig, import("hono").Env>) => ValueOrPromise<Response | import("hono").TypedResponse<unknown>>;
                hook?: import("@hono/zod-openapi").Hook<any, import("hono").Env, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            isConfigured: boolean;
            router: import("@hono/zod-openapi").OpenAPIHono<import("hono").Env, {}, "/">;
            path: string;
            definitions: Record<string, import("@venizia/ignis-kernel").IAuthRouteConfig>;
            getRouter(): import("@hono/zod-openapi").OpenAPIHono<import("hono").Env, {}, "/">;
            registerRoutesFromRegistry(opts?: {
                paths?: import("@venizia/ignis-kernel").TRoutePathScope;
            }): void;
            configure(opts?: {} | undefined): Promise<import("@hono/zod-openapi").OpenAPIHono<import("hono").Env, {}, "/">>;
            buildRouteMiddlewares<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): {
                restConfig: Omit<RouteConfig, "authenticate" | "authorize">;
                security: {
                    [x: string]: never[];
                }[];
                mws: import("hono").MiddlewareHandler<import("hono").Env>[];
            };
            getRouteConfigs<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & import("@hono/zod-openapi").RouteConfig & {
                getRoutingPath(): string;
            };
            getJSXRouteConfigs<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & import("@hono/zod-openapi").RouteConfig & {
                getRoutingPath(): string;
            };
            bindDefaultRoutes(): ValueOrPromise<void>;
            scope: string;
            identifier: string;
            get logger(): import("@venizia/ignis-helpers").ILogger;
            set logger(value: import("@venizia/ignis-helpers").ILogger);
            getIdentifier(): string;
            getLogger(): import("@venizia/ignis-helpers").ILogger;
        };
    };
}
```

Source: `packages/core-server/src/components/static-asset/controller/factory.ts`

## `StaticAssetDefaults`

*class*

Defaults of the static asset component.

```ts
export declare class StaticAssetDefaults {
    /** Where a signed policy may write. The final key is never inside it, so content cannot be replaced after the commit. */
    static readonly PENDING_PREFIX = "pending/";
    /** The most file parts one upload request may carry unless `serverUpload.maxFiles` says otherwise. */
    static readonly MAX_UPLOAD_FILES = 20;
    /** The most bytes of JSON one file's signed `metadata` may take: the token travels in every request. */
    static readonly MAX_TOKEN_METADATA_BYTES = 1024;
    /** The key of the application's token metadata inside a MetaLink row's `metadata` column. */
    static readonly META_LINK_METADATA_KEY = "app";
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetErrors`

*const*

Codes a client branches on for a rejected static-asset request. A throw site may override `message` to name the offending value.

```ts
export declare const StaticAssetErrors: {
    readonly UPLOAD_NOT_AUTHORIZED: {
        readonly message: {
            readonly text: "Not allowed to upload";
            readonly code: "core.static_asset.upload_not_authorized";
        };
        readonly statusCode: 403;
        readonly category: "validation";
    };
    /** Both upload paths - one condition, one code to branch on. */
    readonly UPLOAD_TOO_LARGE: {
        readonly message: {
            readonly text: "File is larger than the maximum allowed";
            readonly code: "core.static_asset.upload_too_large";
        };
        readonly statusCode: 413;
        readonly category: "validation";
    };
    /** Deliberately not 404 and deliberately not "expired": a caller learns only that the token is no good, never whether the key it names exists. */
    readonly INVALID_COMMIT_TOKEN: {
        readonly message: {
            readonly text: "Invalid commit token";
            readonly code: "core.static_asset.invalid_commit_token";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly EXPIRED_COMMIT_TOKEN: {
        readonly message: {
            readonly text: "Commit token has expired";
            readonly code: "core.static_asset.expired_commit_token";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    /** The pending object is not the one that was read: it was overwritten or removed after the pin. Raised by a pinned read and by the commit copy. */
    readonly UPLOAD_CHANGED: {
        readonly message: {
            readonly text: "The uploaded file changed after it was validated";
            readonly code: "core.static_asset.upload_changed";
        };
        readonly statusCode: 409;
        readonly category: "validation";
    };
    /** The destination already holds an object: the token was committed once, and a second commit would overwrite it. */
    readonly UPLOAD_ALREADY_COMMITTED: {
        readonly message: {
            readonly text: "The upload was already committed";
            readonly code: "core.static_asset.upload_already_committed";
        };
        readonly statusCode: 409;
        readonly category: "validation";
    };
    /** The metadata a policy would sign is not allowed: oversized, or sent by a client with no `resolvers.metadata` to read it. */
    readonly UPLOAD_METADATA_INVALID: {
        readonly message: {
            readonly text: "Invalid upload metadata";
            readonly code: "core.static_asset.upload_metadata_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    /** With a `validation` on, `commit` takes the token `upload-validate` returned, not the one the policy issued. */
    readonly UPLOAD_NOT_VALIDATED: {
        readonly message: {
            readonly text: "The upload has not been validated";
            readonly code: "core.static_asset.upload_not_validated";
        };
        readonly statusCode: 422;
        readonly category: "validation";
    };
    readonly BUCKET_NAME_INVALID: {
        readonly message: {
            readonly text: "Invalid bucket name";
            readonly code: "core.static_asset.bucket_name_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly OBJECT_NAME_INVALID: {
        readonly message: {
            readonly text: "Invalid object name or path";
            readonly code: "core.static_asset.object_name_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    /** The application's naming hook produced a key outside the entry's `keyPrefix`; nothing is written. */
    readonly OBJECT_KEY_OUT_OF_SCOPE: {
        readonly message: {
            readonly text: "Object key is outside the key prefix of this controller";
            readonly code: "core.static_asset.object_key_out_of_scope";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly FILE_EMPTY: {
        readonly message: {
            readonly text: "Empty file content";
            readonly code: "core.static_asset.file_empty";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
};
```

Source: `packages/core-server/src/components/static-asset/common/errors.ts`

## `StaticAssetHeaders`

*class*

What a controller sends with every object.

```ts
export declare class StaticAssetHeaders {
    static readonly NOSNIFF = "nosniff";
    static readonly CSP_SANDBOX = "sandbox";
    static readonly RANGE_UNIT: "bytes";
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetIngestUtility`

*class*

Storing an object that came from somewhere else.

```ts
export declare class StaticAssetIngestUtility {
    /**
     * Fetches an untrusted url and stores what comes back, without the bytes passing through this
     * process: the guarded body is capped and handed to `writeStream` as a stream.
     *
     * The url is fetched by a `NativeFetcher` with a `guard` - scheme allow-list, every resolved address
     * checked, redirects walked by hand with a per-hop re-check, a timeout and a size cap. The connection goes to the
     * address that was checked, so a DNS answer that changes afterwards is never used; see `UrlGuard`.
     *
     * The served content type is decided from the stored KEY, never from what the remote host
     * claimed - the same rule the asset routes apply, and for the same reason.
     */
    static fromUrl(opts: IStaticAssetIngestFromUrlOptions): Promise<IStaticAssetIngestFromUrlResult>;
}
```

Source: `packages/core-server/src/components/static-asset/utilities/ingest.utility.ts`

## `StaticAssetMetaLinkCodes`

*class*

Codes the component reports in a body instead of throwing.

```ts
export declare class StaticAssetMetaLinkCodes {
    /** Reported in the body, never thrown: the bytes are stored, only the row is not. A CODE, because a 200 bypasses the middleware that strips the driver's `detail`/`table`/`constraint`. */
    static readonly CREATE_FAILED = "META_LINK_CREATE_FAILED";
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetObjectLinkUtility`

*class*

Builds the URL of an object in the shape its controller serves.

```ts
export declare class StaticAssetObjectLinkUtility {
    /** The mount path may be declared with or without a leading slash; a link must carry exactly one. */
    static normalizeBasePath(opts: {
        basePath: string;
    }): string;
    /** Encodes an object path into a SINGLE url segment: `{objectName}` matches one segment only, so `/` must be percent-encoded too (Hono decodes it back before the handler reads the param). */
    private static encodeObjectPath;
    /** The URL of one object, in the shape its controller serves: a raw path with `rawObjectPath`, a percent-encoded one without. */
    static build(opts: IObjectLocation & {
        basePath: string;
        rawObjectPath?: boolean;
    }): string;
}
```

Source: `packages/core-server/src/components/static-asset/utilities/object-link.utility.ts`

## `StaticAssetPinnedFile`

*class*

The pending file as `validation.handler` sees it. Every read asks the storage for exactly the
content that was pinned, so a handler cannot parse bytes that are not the ones `commit` will copy:
a read that finds other content or no object throws `UPLOAD_CHANGED`.

```ts
export declare class StaticAssetPinnedFile {
    readonly key: string;
    readonly size: number;
    private readonly helper;
    private readonly location;
    private readonly pin;
    constructor(opts: {
        helper: IStorageHelper;
        location: IObjectLocation;
        pin: IStaticAssetPin;
        size: number;
    });
    /** What a read or a copy requires of the object: the exact version when the pin has one, else the ETag. */
    static conditionOf(opts: {
        pin: IStaticAssetPin;
    }): {
        ifMatch?: string;
        versionId?: string;
    };
    /** The pin of what the storage holds now. An object with no ETag cannot be pinned. */
    static pinOf(opts: {
        stat: IFileStat;
        scope: string;
    }): IStaticAssetPin;
    stream(opts?: {
        range?: {
            start: number;
            end?: number;
        };
    }): Promise<ReadableStream<Uint8Array>>;
}
```

Source: `packages/core-server/src/components/static-asset/utilities/pinned-file.utility.ts`

## `StaticAssetRouteKeys`

*class*

The built-in routes of a generated controller, the keys of `routes`.

```ts
export declare class StaticAssetRouteKeys {
    static readonly UPLOAD = "upload";
    static readonly LIST_OBJECTS = "listObjects";
    static readonly DELETE_OBJECT = "deleteObject";
    static readonly GET_OBJECT_BY_NAME = "getObjectByName";
    static readonly DOWNLOAD_OBJECT_BY_NAME = "downloadObjectByName";
    static readonly UPLOAD_POLICY = "uploadPolicy";
    static readonly UPLOAD_COMMIT = "uploadCommit";
    static readonly UPLOAD_VALIDATE = "uploadValidate";
    static readonly RECREATE_META_LINK = "recreateMetaLink";
    /** Every key, in registration order. */
    static readonly ALL: readonly ["getObjectByName", "downloadObjectByName", "upload", "deleteObject", "listObjects", "uploadPolicy", "uploadCommit", "uploadValidate", "recreateMetaLink"];
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetServe`

*class*

The serve side of an entry's controller, public so a route of your own makes the same decisions: the served content type and the `ETag` and `304` answers.

```ts
export declare class StaticAssetServe {
    /**
     * The served type comes from the object NAME, never the backend or the uploader: a renderable type on
     * the API origin is stored XSS. The backend's own content-type is never sent.
     */
    static resolveServedContentType(opts: {
        helper: IStorageHelper;
        object: IObjectRef;
    }): {
        contentType: string;
        isRenderable: boolean;
    };
    /**
     * Sets `ETag` and `Last-Modified` from `stat` and answers whether the client's copy is current. A `true`
     * means the caller returns a 304 without reading the object; the headers are already on `ctx`.
     * `If-None-Match` decides alone when present (weak comparison, `*` matches any); otherwise
     * `If-Modified-Since` does. An application's own route can call it with a `stat` it already holds.
     */
    static applyValidators(opts: {
        ctx: TRouteContext;
        stat: IFileStat;
    }): boolean;
}
```

Source: `packages/core-server/src/components/static-asset/controller/routes/serve.ts`

## `StaticAssetToggleUtility`

*class*

Reads the `{ use }` switches an entry is written with. The logic lives in the kernel's `ToggleUtility`, shared with controllers.

```ts
export declare class StaticAssetToggleUtility extends ToggleUtility {
}
```

Source: `packages/core-server/src/components/static-asset/utilities/toggle.utility.ts`

## `StaticAssetTokenStages`

*class*

Where a commit token is in its life: issued with the policy, then validated against the content it pins.

```ts
export declare class StaticAssetTokenStages {
    static readonly ISSUED = "issued";
    static readonly VALIDATED = "validated";
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetUploadCommitService`

*class*

Moves a pending upload to its final key and records it: the body of the `upload-commit` route,
callable without a request. A service that saves its own record commits the upload in the same
call instead of asking the client for a second request.

The token proves the key was issued by a policy, to one owner, with the metadata the application
chose for the file. A commit is single-use: it refuses a destination that already holds an object.

```ts
export declare class StaticAssetUploadCommitService<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> extends BaseService {
    private readonly options;
    private readonly keyPrefix;
    private readonly pendingPrefix;
    private readonly policyKeyPrefix;
    constructor(opts: IStaticAssetUploadCommitServiceOptions<Schema>);
    /** The signature, the expiry, the owner, the bucket and the pending scope: the checks every stage of a token starts with. */
    private readPayload;
    /**
     * Everything `commit` checks before it touches storage, and nothing else: the signature, the
     * expiry, the owner, the bucket and the pending scope. Returns the PENDING object with the token's
     * owner and metadata, with no storage call and no side effect, so an application can read an
     * uploaded file and report its problems to the user before anything is committed.
     *
     * A token this refuses is refused the same way `commit` refuses it, and every refusal says no more
     * than that the token is no good: a caller learns nothing about which keys exist.
     */
    verify(opts: {
        token: string;
        owner: string;
    }): Promise<IObjectLocation & {
        owner: string;
        metadata: TStaticAssetTokenMetadata;
    }>;
    /**
     * `verify`, then the application's own check of the pending file, read once through a file pinned
     * to the content that is there now. A valid file answers the token `commit` takes: it is bound to
     * that content and dies when the incoming token does. An invalid one answers its issues and no token.
     * A token of either stage may be validated again, which pins whatever is there at that moment.
     */
    validate(opts: {
        token: string;
        owner: string;
    }): Promise<IStaticAssetValidateResult<unknown>>;
    private runValidation;
    /**
     * Moves the pending object to its final key and, when the entry keeps a MetaLink table, writes the
     * row. With a `validation` on it takes the token `validate` returned and never runs the handler; the
     * copy then happens only if the content still matches the pin. The final key is the default one
     * unless `resolvers.commit.destination` names another; either way it must be free, so a token
     * commits once. A MetaLink failure rides the result as a code: the object IS committed by then.
     */
    commit(opts: {
        token: string;
        /** Who is committing: a token commits only for the owner it was issued to. */
        owner: string;
        labels?: TStaticAssetUploadLabels;
        /** The final key for this call. It wins over `resolvers.commit.destination` and passes the same checks. */
        destination?: IObjectRef;
    }): Promise<IStaticAssetCommitResult>;
    /** The default key is the pending one without the pending prefix; the application's resolver may name another, inside the scope. */
    private resolveDestination;
    /** The caller's `destination`, else the resolver's, else none: the default key. */
    private pickDestination;
    /** The token's only commit: a second one, or a re-post to the pending key, must not overwrite what the first one stored. */
    private assertDestinationFree;
    /** A pin makes the copy conditional; a failed condition is a changed upload, and nothing is written. */
    private copyPinned;
}
```

Source: `packages/core-server/src/components/static-asset/services/commitment.service.ts`

## `StaticAssetUploadPolicyService`

*class*

Signs the permission for a browser to post bytes straight to storage: the body of the
`upload-policy` route, callable without a request.

Authorization is NOT here. A policy is a write credential, and who may ask for one is the route's
`directUpload.authorize`; code that calls this service has decided that for itself.

```ts
export declare class StaticAssetUploadPolicyService extends BaseService {
    private readonly options;
    private readonly policyKeyPrefix;
    private readonly commitLifetimeMs?;
    constructor(opts: IStaticAssetUploadPolicyServiceOptions);
    /** `undefined` when `expires.commit` is not set: the token then dies with the policy. */
    private static resolveCommitLifetimeMs;
    /**
     * One signed policy per file. A size over `maxBytes`, a name that is not one valid key segment and
     * `metadata` over the cap are refused before any policy is signed. `files[].metadata` is what the
     * token signs: the caller has already decided it (the route runs `resolvers.metadata`).
     */
    issuePolicies(opts: {
        files: TStaticAssetUploadPolicyRequest['files'];
        owner: string;
    }): Promise<TStaticAssetUploadPolicy[]>;
}
```

Source: `packages/core-server/src/components/static-asset/services/policy.service.ts`

## `StaticAssetValidation`

*class*

Defines the application's check of an uploaded file; see `directUpload.validation`.

```ts
export declare class StaticAssetValidation {
    /** Returns `opts` switched on. It exists to infer `IssueSchema`, so a handler that answers another shape of issue fails type-checking. */
    static define<IssueSchema extends z.ZodType>(opts: IStaticAssetValidation<IssueSchema>): IStaticAssetValidation<IssueSchema> & {
        use: true;
    };
}
```

Source: `packages/core-server/src/components/static-asset/common/validation.ts`

## `TMetaLink`

*type*

A MetaLink row as selected from the table.

```ts
export type TMetaLink = TTableObject<TMetaLinkSchema>;
```

Source: `packages/core-server/src/components/static-asset/models/base.model.ts`

## `TMetaLinkCompatibleSchema`

*type*

Any table whose row carries the MetaLink fields. The component reads and writes the ROW, so the table is free to carry another name or to live in another Postgres schema.

```ts
export type TMetaLinkCompatibleSchema = TTableSchemaWithId & {
    $inferSelect: TMetaLink;
};
```

Source: `packages/core-server/src/components/static-asset/models/base.model.ts`

## `TMetaLinkConfig`

*type*

The MetaLink table belongs to the application. `Schema` defaults to the table IGNIS ships, and widens to any table whose row carries the same fields.

```ts
export type TMetaLinkConfig<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
    repository: TValueOrAsyncResolver<IMetaLinkRepository>;
    createMetaLink?: (opts: {
        uploadResult: IUploadResult;
        fileStat: IFileStat;
        /** The caller's labels: form fields on an upload, beside the commit token on a direct one. */
        labels: TStaticAssetUploadLabels;
    }) => ValueOrPromise<{
        count: number;
        data: TTableObject<Schema>;
    }>;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TMetaLinkRecreateAction`

*type*

One of the `MetaLinkRecreateActions` values.

```ts
export type TMetaLinkRecreateAction = TConstValue<typeof MetaLinkRecreateActions>;
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`
