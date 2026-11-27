---
title: "@venizia/ignis-kernel (7 of 9)"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel (7 of 9)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 7 of 9 of [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel).

## `RouteConfigResolver`

*class*

Every method here is an unbound static, called from the exported aliases below without a
receiver - a method must call another via `RouteConfigResolver.other(...)`, never
`this.other(...)`, or `this` is `undefined` at the call site.

```ts
export declare class RouteConfigResolver {
    /** Path params always reach the validator as strings, so a number-typed id must be coerced before `z.number()` sees it - `OpenApiSchemas.idParams` alone rejects `/accounts/7`. */
    private static idPathParamsSchema;
    /**
     * The default body of a write route: the entity schema without the keys the entity stamps, and on
     * an update without `id` - the path or `where` names the rows. Zod strips a left-out key a client
     * sends. With nothing to leave out the schema itself is the body, refinements and OpenAPI name kept.
     */
    private static toWriteBodySchema;
    /** Picks the caller's per-route `request.params` override, else the entity's id path-param schema. */
    private static resolveIdParams;
    /** Creates conditional count response schema. */
    static conditionalCountResponse<T extends z.ZodType>(dataSchema: T): z.ZodUnion<readonly [z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        data: T;
    }, z.core.$strip>, T]>;
    /** Resolves a route's response schema - user override or default. Holds the one cast every `resolve*Config` needs: generic `C` is only known by its wider structural constraint, so it cannot be proven at the value level to collapse to `TResolvedResponseSchema`. */
    private static resolveResponseSchema;
    static resolveCountConfig<C extends ICustomizableRoutes['count']>(opts: {
        config: C;
        isStrict: boolean;
    }): {
        request: {
            query: TAnyObjectSchema | z.ZodObject<{
                where: z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]> | z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
            }, z.core.$strip>;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strip>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    static resolveFindConfig<C extends ICustomizableRoutes['find'], FindSchema extends TAnyObjectSchema>(opts: {
        config: C;
        selectSchema: FindSchema;
    }): {
        request: {
            query: TAnyObjectSchema | z.ZodObject<{
                filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>>]>>;
            }, z.core.$strip>;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
                "x-request-count": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodUnion<readonly [z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
                data: z.ZodArray<FindSchema>;
            }, z.core.$strip>, z.ZodArray<FindSchema>]>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    static resolveFindByIdConfig<C extends ICustomizableRoutes['findById'], FindByIdSchema extends TAnyObjectSchema>(opts: {
        idType: TIdSchemaType;
        config: C;
        selectSchema: FindByIdSchema;
    }): {
        request: {
            params: TAnyObjectSchema | z.ZodObject<{
                id: z.ZodString;
            }, z.core.$strip> | z.ZodObject<{
                id: z.ZodCoercedNumber<unknown>;
            }, z.core.$strip>;
            query: TAnyObjectSchema | z.ZodObject<{
                filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>>]>>;
            }, z.core.$strip>;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
                "x-request-count": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodUnion<readonly [z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
                data: FindByIdSchema;
            }, z.core.$strip>, FindByIdSchema]>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    static resolveFindOneConfig<C extends ICustomizableRoutes['findOne'], FindOneSchema extends TAnyObjectSchema>(opts: {
        config: C;
        selectSchema: FindOneSchema;
    }): {
        request: {
            query: TAnyObjectSchema | z.ZodObject<{
                filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>>]>>;
            }, z.core.$strip>;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
                "x-request-count": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodUnion<readonly [z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
                data: FindOneSchema;
            }, z.core.$strip>, FindOneSchema]>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    /** `serverStampedKeys` - the keys the default body leaves out. */
    static resolveCreateConfig<C extends ICustomizableRoutes['create'], SelectSchema extends TAnyObjectSchema, CreateSchema extends TAnyObjectSchema>(opts: {
        config: C;
        selectSchema: SelectSchema;
        createSchema: CreateSchema;
        serverStampedKeys?: string[];
    }): {
        request: {
            body: TAnyObjectSchema;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
                "x-request-count": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodUnion<readonly [z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
                data: SelectSchema;
            }, z.core.$strip>, SelectSchema]>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    private static resolveUpdateByIdConfig;
    private static resolveUpdateByConfig;
    private static resolveDeleteByIdConfig;
    private static resolveDeleteByConfig;
    private static resolveRestoreByIdConfig;
    private static resolveRestoreByConfig;
    /**
     * The authentication of one route: its own `authenticate` wins over the controller's, and
     * `{ skip: true }` leaves the route with no strategy at all. Shared by every controller factory so
     * the priority is written once.
     */
    static resolveAuthenticate(opts: {
        controller?: {
            strategies?: TAuthStrategy[];
            mode?: TAuthMode;
        };
        endpoint?: TRouteAuthenticateConfig;
    }): {
        strategies?: TAuthStrategy[];
        mode?: TAuthMode;
    };
    /** The authorization of one route. Priority: endpoint authenticate.skip > endpoint authorize.skip > endpoint authorize > controller authorize. */
    static resolveAuthorize(opts: {
        controller?: IAuthorizationSpec | IAuthorizationSpec[];
        endpoint?: TRouteAuthConfig;
    }): IAuthorizationSpec | IAuthorizationSpec[] | undefined;
    /**
     * Generates the route configurations of a CRUD controller: one for each route listed in `routes`, none for
     * the rest. `serverStampedKeys` - the keys the default write bodies leave out.
     */
    static defineControllerRouteConfigs<SelectSchema extends TAnyObjectSchema, CreateSchema extends TAnyObjectSchema, UpdateSchema extends TAnyObjectSchema>(opts: {
        isStrict: boolean;
        idType: TIdSchemaType;
        authenticate?: {
            strategies?: TAuthStrategy[];
            mode?: TAuthMode;
        };
        authorize?: IAuthorizationSpec | IAuthorizationSpec[];
        schema: {
            select: SelectSchema;
            create: CreateSchema;
            update: UpdateSchema;
        };
        serverStampedKeys?: string[];
        routes?: TCrudRoutes;
    }): {
        readonly RESTORE_BY?: {
            method: "post";
            path: string;
            description: string;
            authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            authorize: IAuthorizationSpec<import("hono").Env, string, string> | IAuthorizationSpec<import("hono").Env, string, string>[] | undefined;
            request: {
                query: TAnyObjectSchema | z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                }, z.core.$strip>;
                headers: TAnyObjectSchema | z.ZodObject<{
                    "x-request-id": z.ZodOptional<z.ZodString>;
                    "x-request-channel": z.ZodOptional<z.ZodString>;
                    "x-device-info": z.ZodOptional<z.ZodString>;
                    "x-request-count": z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
            };
            responses: {
                '4XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                '5XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                200: {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: z.ZodArray<SelectSchema>;
                            }, z.core.$strip>, z.ZodArray<SelectSchema>]>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: import("../index.js").TResponseHeaders;
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: z.ZodArray<SelectSchema>;
                            }, z.core.$strip>, z.ZodArray<SelectSchema>]>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        } | undefined;
        readonly RESTORE_BY_ID?: {
            method: "post";
            path: string;
            description: string;
            authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            authorize: IAuthorizationSpec<import("hono").Env, string, string> | IAuthorizationSpec<import("hono").Env, string, string>[] | undefined;
            request: {
                params: TAnyObjectSchema | z.ZodObject<{
                    id: z.ZodString;
                }, z.core.$strip> | z.ZodObject<{
                    id: z.ZodCoercedNumber<unknown>;
                }, z.core.$strip>;
                headers: TAnyObjectSchema | z.ZodObject<{
                    "x-request-id": z.ZodOptional<z.ZodString>;
                    "x-request-channel": z.ZodOptional<z.ZodString>;
                    "x-device-info": z.ZodOptional<z.ZodString>;
                    "x-request-count": z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
            };
            responses: {
                '4XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                '5XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                200: {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: SelectSchema;
                            }, z.core.$strip>, SelectSchema]>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: import("../index.js").TResponseHeaders;
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: SelectSchema;
                            }, z.core.$strip>, SelectSchema]>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        } | undefined;
        readonly DELETE_BY?: {
            method: "delete";
            path: string;
            description: string;
            authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            authorize: IAuthorizationSpec<import("hono").Env, string, string> | IAuthorizationSpec<import("hono").Env, string, string>[] | undefined;
            request: {
                headers: TAnyObjectSchema | z.ZodObject<{
                    "x-request-id": z.ZodOptional<z.ZodString>;
                    "x-request-channel": z.ZodOptional<z.ZodString>;
                    "x-device-info": z.ZodOptional<z.ZodString>;
                    "x-request-count": z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
                body?: {
                    description: string;
                    content: {
                        "application/json": {
                            schema: TAnyObjectSchema;
                        };
                    };
                    required: boolean | undefined;
                } | undefined;
                query: TAnyObjectSchema | z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                }, z.core.$strip>;
            };
            responses: {
                '4XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                '5XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                200: {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: z.ZodArray<SelectSchema>;
                            }, z.core.$strip>, z.ZodArray<SelectSchema>]>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: import("../index.js").TResponseHeaders;
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: z.ZodArray<SelectSchema>;
                            }, z.core.$strip>, z.ZodArray<SelectSchema>]>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        } | undefined;
        readonly DELETE_BY_ID?: {
            method: "delete";
            path: string;
            description: string;
            authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            authorize: IAuthorizationSpec<import("hono").Env, string, string> | IAuthorizationSpec<import("hono").Env, string, string>[] | undefined;
            request: {
                params: TAnyObjectSchema | z.ZodObject<{
                    id: z.ZodString;
                }, z.core.$strip> | z.ZodObject<{
                    id: z.ZodCoercedNumber<unknown>;
                }, z.core.$strip>;
                headers: TAnyObjectSchema | z.ZodObject<{
                    "x-request-id": z.ZodOptional<z.ZodString>;
                    "x-request-channel": z.ZodOptional<z.ZodString>;
                    "x-device-info": z.ZodOptional<z.ZodString>;
                    "x-request-count": z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
            };
            responses: {
                '4XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                '5XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                200: {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: SelectSchema;
                            }, z.core.$strip>, SelectSchema]>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: import("../index.js").TResponseHeaders;
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: SelectSchema;
                            }, z.core.$strip>, SelectSchema]>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        } | undefined;
        readonly UPDATE_BY?: {
            method: "patch";
            path: string;
            description: string;
            authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            authorize: IAuthorizationSpec<import("hono").Env, string, string> | IAuthorizationSpec<import("hono").Env, string, string>[] | undefined;
            request: {
                query: TAnyObjectSchema | z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                }, z.core.$strip>;
                body: {
                    description: string;
                    content: {
                        "application/json": {
                            schema: TAnyObjectSchema;
                        };
                    };
                    required: boolean | undefined;
                };
                headers: TAnyObjectSchema | z.ZodObject<{
                    "x-request-id": z.ZodOptional<z.ZodString>;
                    "x-request-channel": z.ZodOptional<z.ZodString>;
                    "x-device-info": z.ZodOptional<z.ZodString>;
                    "x-request-count": z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
            };
            responses: {
                '4XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                '5XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                200: {
                    description: string;
                    content: {
                        "application/json": {
// ... cut
```

Source: `packages/kernel/src/base/controllers/factory/definition.ts`

## `RoutePathScopes`

*class*

Which decorator-defined routes `registerRoutesFromRegistry` registers: STATIC (no path parameter), PARAM (a path parameter) or ALL.

```ts
export declare class RoutePathScopes extends ConstClass {
    static readonly STATIC = "static";
    static readonly PARAM = "param";
    static readonly ALL = "all";
}
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `rpc`

*const*

Generic RPC decorator. Registers RPC config in metadata registry.

```ts
export declare const rpc: <RpcRouteConfigType extends IRpcMetadata>(opts: {
    configs: RpcRouteConfigType;
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `ScopeFilterMissingBehaviors`

*class*

What a row-scope filter (`@model` settings.access) does when `resolve()` returns null/undefined.

```ts
export declare class ScopeFilterMissingBehaviors extends ConstClass {
    /** An unresolved scope matches ZERO rows - the safe reading of "caller's scope is unknown". */
    static readonly DENY = "deny";
    /** Explicit opt-out: no scope is applied. For migrations and background jobs, never inferred from a request. */
    static readonly ALLOW = "allow";
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `ScopeFilters`

*class*

The third `resolve()` state, beside a `where` and `deny`-by-default null/undefined: unrestricted
for THIS call. `onMissing: 'allow'` cannot express it - `onMissing` lives on the model's static
settings, so using it for a per-user bypass (an internal operator) would also unscope every
ordinary user whose `resolve()` happens to return nothing.

```ts
export declare class ScopeFilters {
    /**
     * Return from `resolve()` to apply NO scope for this request - a caller the application has
     * decided sees everything. Deliberately a symbol: forgetting to return must land in deny, and no
     * JSON body, query string, or header can ever produce this value. `Symbol.for` so two installed
     * copies of this package agree on identity, same as `DATA_SOURCE_BRAND`.
     */
    static readonly UNRESTRICTED: unique symbol;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `ScopeOperations`

*class*

What a repository call does to rows, as the row scope (`@model` settings.access) sees it.
`access.resolve` receives one CONCRETE operation (READ, CREATE, UPDATE or DELETE), never a group,
so one function can answer a wide scope for a read and a narrow one for a write. WRITE and ALL
are groups of concrete operations, for application code that asks "is this a write?".

```ts
export declare class ScopeOperations {
    static readonly READ = "read";
    static readonly CREATE = "create";
    static readonly UPDATE = "update";
    static readonly DELETE = "delete";
    /** CREATE, UPDATE and DELETE. */
    static readonly WRITE = "write";
    /** Every concrete operation. */
    static readonly ALL = "all";
    /** All six values: the four concrete operations and the two groups. */
    static readonly SCHEME_SET: Set<string>;
    /** The concrete operations: what `access.resolve` can receive. */
    static readonly OPERATION_SET: Set<string>;
    /** Which concrete operations each group holds. */
    static readonly GROUP_MAP: ReadonlyMap<string, ReadonlySet<string>>;
    static isValid(value: string): boolean;
    /**
     * Whether `operation` belongs to `group`. A concrete operation includes itself and nothing else;
     * WRITE includes CREATE, UPDATE and DELETE; ALL includes all four.
     */
    static includes(opts: {
        group: TScopeOperationGroup;
        operation: TScopeOperation;
    }): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`
