---
title: "@venizia/ignis-filter/schemas"
description: "Every export of @venizia/ignis-filter/schemas, from the built declarations (generated)."
---

# `@venizia/ignis-filter/schemas`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

11 exports, 11 with TSDoc.

## `FieldsSchema`

*const*

Field selection: an array of names to include, or an object of `name: boolean`. Optional.

```ts
export declare const FieldsSchema: import("zod").ZodOptional<import("zod").ZodUnion<[import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodBoolean>, import("zod").ZodArray<import("zod").ZodString>]>>;
```

Source: `packages/filter/src/schemas/index.ts`

## `FilterSchema`

*const*

The whole filter: `where`, `fields`, `include`, `order`, `limit`, `offset` and `skip`. Accepts an object or a JSON string; a malformed string becomes a validation issue.

```ts
export declare const FilterSchema: import("zod").ZodOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
    where: import("zod").ZodOptional<import("zod").ZodUnion<readonly [import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodAny, import("zod").ZodTransform<any, any>>, import("zod").ZodType<any, unknown, import("zod/v4/core").$ZodTypeInternals<any, unknown>>>, import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodString, import("zod").ZodTransform<any, string>>, import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodAny, import("zod").ZodTransform<any, any>>, import("zod").ZodType<any, unknown, import("zod/v4/core").$ZodTypeInternals<any, unknown>>>>]>>;
    fields: import("zod").ZodOptional<import("zod").ZodUnion<[import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodBoolean>, import("zod").ZodArray<import("zod").ZodString>]>>;
    include: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
        relation: import("zod").ZodString;
        scope: import("zod").ZodOptional<import("zod").ZodLazy<import("zod").ZodType<any, unknown, import("zod/v4/core").$ZodTypeInternals<any, unknown>>>>;
    }, import("zod/v4/core").$strip>>>;
    order: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
    limit: import("zod").ZodOptional<import("zod").ZodNumber>;
    offset: import("zod").ZodOptional<import("zod").ZodNumber>;
    skip: import("zod").ZodOptional<import("zod").ZodNumber>;
}, import("zod/v4/core").$strip>, import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodString, import("zod").ZodTransform<any, string>>, import("zod").ZodObject<{
    where: import("zod").ZodOptional<import("zod").ZodUnion<readonly [import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodAny, import("zod").ZodTransform<any, any>>, import("zod").ZodType<any, unknown, import("zod/v4/core").$ZodTypeInternals<any, unknown>>>, import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodString, import("zod").ZodTransform<any, string>>, import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodAny, import("zod").ZodTransform<any, any>>, import("zod").ZodType<any, unknown, import("zod/v4/core").$ZodTypeInternals<any, unknown>>>>]>>;
    fields: import("zod").ZodOptional<import("zod").ZodUnion<[import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodBoolean>, import("zod").ZodArray<import("zod").ZodString>]>>;
    include: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
        relation: import("zod").ZodString;
        scope: import("zod").ZodOptional<import("zod").ZodLazy<import("zod").ZodType<any, unknown, import("zod/v4/core").$ZodTypeInternals<any, unknown>>>>;
    }, import("zod/v4/core").$strip>>>;
    order: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
    limit: import("zod").ZodOptional<import("zod").ZodNumber>;
    offset: import("zod").ZodOptional<import("zod").ZodNumber>;
    skip: import("zod").ZodOptional<import("zod").ZodNumber>;
}, import("zod/v4/core").$strip>>]>>;
```

Source: `packages/filter/src/schemas/index.ts`

## `InclusionSchema`

*const*

The `include` array: each entry names a `relation` and may carry a nested `scope` filter. Optional.

```ts
export declare const InclusionSchema: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
    relation: import("zod").ZodString;
    scope: import("zod").ZodOptional<import("zod").ZodLazy<import("zod").ZodType<any, unknown, import("zod/v4/core").$ZodTypeInternals<any, unknown>>>>;
}, import("zod/v4/core").$strip>>>;
```

Source: `packages/filter/src/schemas/index.ts`

## `LimitSchema`

*const*

Maximum number of rows; a non-negative integer, optional.

```ts
export declare const LimitSchema: import("zod").ZodOptional<import("zod").ZodNumber>;
```

Source: `packages/filter/src/schemas/index.ts`

## `OffsetSchema`

*const*

Number of rows to offset for pagination; a non-negative integer, optional.

```ts
export declare const OffsetSchema: import("zod").ZodOptional<import("zod").ZodNumber>;
```

Source: `packages/filter/src/schemas/index.ts`

## `OrderBySchema`

*const*

Sort order as strings such as `createdAt DESC`; JSON paths like `metadata.priority DESC` are allowed. Optional.

```ts
export declare const OrderBySchema: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
```

Source: `packages/filter/src/schemas/index.ts`

## `QuerySchemaFactory`

*class*

The schemas are built by a factory rather than declared at module scope because documentation metadata has to be injected. `.openapi()` returns a NEW schema instead of mutating, and three of these decorations sit on inner nodes of a nested tree, so a consumer cannot annotate them after the tree is composed - the outer node would still hold the undecorated children.

Built with plain `zod`, never `@hono/zod-openapi`: the OpenAPI layer pulls in Hono, and these schemas must stay usable in a browser. `@hono/zod-openapi` declares `zod` as a peer, so it patches the same prototype - a server that imports it can decorate these schemas even though they were built without it.

```ts
export declare class QuerySchemaFactory {
    private static readonly identityDecorator;
    /** `limits.whereDepth` is the deepest `and` / `or` nesting a `where` may have (default 20); a deeper one is a validation issue. */
    static build(opts?: {
        decorate?: TSchemaDecorator;
        limits?: {
            whereDepth?: number;
        };
    }): {
        FieldsSchema: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
        FilterSchema: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
            where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
            fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
            include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                relation: z.ZodString;
                scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
            }, z.core.$strip>>>;
            order: z.ZodOptional<z.ZodArray<z.ZodString>>;
            limit: z.ZodOptional<z.ZodNumber>;
            offset: z.ZodOptional<z.ZodNumber>;
            skip: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
            where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
            fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
            include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                relation: z.ZodString;
                scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
            }, z.core.$strip>>>;
            order: z.ZodOptional<z.ZodArray<z.ZodString>>;
            limit: z.ZodOptional<z.ZodNumber>;
            offset: z.ZodOptional<z.ZodNumber>;
            skip: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>]>>;
        InclusionSchema: z.ZodOptional<z.ZodArray<z.ZodObject<{
            relation: z.ZodString;
            scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
        }, z.core.$strip>>>;
        LimitSchema: z.ZodOptional<z.ZodNumber>;
        OffsetSchema: z.ZodOptional<z.ZodNumber>;
        OrderBySchema: z.ZodOptional<z.ZodArray<z.ZodString>>;
        SkipSchema: z.ZodOptional<z.ZodNumber>;
        WhereSchema: z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>;
    };
}
```

Source: `packages/filter/src/schemas/builder.ts`

## `SkipSchema`

*const*

Number of rows to skip for pagination; a non-negative integer, optional.

```ts
export declare const SkipSchema: import("zod").ZodOptional<import("zod").ZodNumber>;
```

Source: `packages/filter/src/schemas/index.ts`

## `TSchemaDecorator`

*type*

Applies documentation metadata to a schema and returns it. A server passes an OpenAPI decorator; a browser passes nothing and gets the identity.

```ts
export type TSchemaDecorator = <TSchema>(schema: TSchema, metadata: TSchemaMetadata) => TSchema;
```

Source: `packages/filter/src/schemas/common/types.ts`

## `TSchemaMetadata`

*type*

The metadata a schema carries for documentation. Structural on purpose - naming the OpenAPI library's type here would pull it into a browser bundle, which is the whole thing this package avoids.

```ts
export type TSchemaMetadata = {
    description?: string;
    type?: string;
    examples?: Array<unknown>;
};
```

Source: `packages/filter/src/schemas/common/types.ts`

## `WhereSchema`

*const*

Query conditions with nested `and` / `or`. Accepts an object or a JSON string; a malformed string becomes a validation issue.

```ts
export declare const WhereSchema: import("zod").ZodUnion<readonly [import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodAny, import("zod").ZodTransform<any, any>>, import("zod").ZodType<any, unknown, import("zod/v4/core").$ZodTypeInternals<any, unknown>>>, import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodString, import("zod").ZodTransform<any, string>>, import("zod").ZodPipe<import("zod").ZodPipe<import("zod").ZodAny, import("zod").ZodTransform<any, any>>, import("zod").ZodType<any, unknown, import("zod/v4/core").$ZodTypeInternals<any, unknown>>>>]>;
```

Source: `packages/filter/src/schemas/index.ts`
