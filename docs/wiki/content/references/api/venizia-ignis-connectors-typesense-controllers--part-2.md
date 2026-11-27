---
title: "@venizia/ignis-connectors/typesense/controllers (2 of 3)"
description: "Every export of @venizia/ignis-connectors/typesense/controllers, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/typesense/controllers (2 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 3 of [`@venizia/ignis-connectors/typesense/controllers`](/references/api/venizia-ignis-connectors-typesense-controllers).

## `SearchControllerFactory`

*class*

Factory for generating turnkey search controllers (single-collection + cross-collection) from entity definitions.

```ts
export declare class SearchControllerFactory extends BaseHelper {
    constructor();
    /** The body schema of `POST /search`: one member per allowed mode (and `raw` when on), extended with `request.body.extend` and the `query.allow.tuning` names. */
    private static buildSearchBody;
    static defineRouteConfigs(opts: {
        selectSchema: z.ZodType;
        authenticate?: {
            strategies?: TAuthStrategy[];
            mode?: TAuthMode;
        };
        authorize?: IAuthorizationSpec | IAuthorizationSpec[];
        /** The friendly modes the body takes (`modes.allow`); every one when left out. */
        allowedModes?: ReadonlyArray<TSearchFriendlyMode>;
        /** `modes.raw` is on: the body takes `mode: 'raw'` too. Left out, `raw` is not in the schema or the OpenAPI document. */
        isRawAllowed?: boolean;
        /** The keys `request.body.extend` adds to every `mode` of the search body. */
        bodyExtension?: z.ZodRawShape;
        /** The names of `query.allow.tuning`: what `engineParams` of the search body may carry. */
        allowedTuning?: string[];
        /** `query.fixed` or `query.default` is set: a hybrid body then takes its `queryBy` from the server when the client sends none. */
        isQueryBySettable?: boolean;
        /** The `request.headers` of `routes.search` and `routes.multiSearch`; none leaves the route config without headers. */
        requestHeaders?: {
            search?: TAnyObjectSchema;
            multiSearch?: TAnyObjectSchema;
        };
        /** `response.document`: the documents of the response, in place of the model's schema. */
        responseDocument?: z.ZodType;
    }): {
        readonly SEARCH: {
            readonly method: "post";
            readonly path: "/search";
            readonly description: "Single-collection search, one body per mode";
            readonly authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            readonly authorize: IAuthorizationSpec<Env, string, string> | IAuthorizationSpec<Env, string, string>[] | undefined;
            readonly request: {
                readonly body: {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodDiscriminatedUnion<[z.ZodObject<{
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                engineParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                                mode: z.ZodLiteral<"keyword">;
                                query: z.ZodOptional<z.ZodString>;
                                queryBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlight: z.ZodOptional<z.ZodBoolean>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                            }, z.core.$strip> | z.ZodObject<{
                                distanceThreshold: z.ZodOptional<z.ZodNumber>;
                                ef: z.ZodOptional<z.ZodNumber>;
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                engineParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                                mode: z.ZodLiteral<"semantic">;
                                vectorField: z.ZodString;
                                nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                queryText: z.ZodOptional<z.ZodString>;
                                k: z.ZodOptional<z.ZodNumber>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                            }, z.core.$strip> | z.ZodObject<{
                                distanceThreshold: z.ZodOptional<z.ZodNumber>;
                                ef: z.ZodOptional<z.ZodNumber>;
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                engineParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                                mode: z.ZodLiteral<"hybrid">;
                                query: z.ZodString;
                                queryBy: z.ZodArray<z.ZodString>;
                                vectorField: z.ZodString;
                                nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                alpha: z.ZodOptional<z.ZodNumber>;
                                k: z.ZodOptional<z.ZodNumber>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                            }, z.core.$strip> | z.ZodObject<{
                                mode: z.ZodLiteral<"raw">;
                                params: z.ZodRecord<z.ZodString, z.ZodAny>;
                            }, z.core.$strip> | z.ZodObject<{
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                mode: z.ZodLiteral<"keyword">;
                                query: z.ZodOptional<z.ZodString>;
                                queryBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlight: z.ZodOptional<z.ZodBoolean>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                                engineParams: z.ZodOptional<z.ZodObject<{
                                    [x: string]: z.ZodOptional<z.ZodUnknown>;
                                }, z.core.$strict>>;
                            } | {
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                mode: z.ZodLiteral<"keyword">;
                                query: z.ZodOptional<z.ZodString>;
                                queryBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlight: z.ZodOptional<z.ZodBoolean>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                                engineParams?: undefined;
                            }, z.core.$strip> | z.ZodObject<{
                                distanceThreshold: z.ZodOptional<z.ZodNumber>;
                                ef: z.ZodOptional<z.ZodNumber>;
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                mode: z.ZodLiteral<"semantic">;
                                vectorField: z.ZodString;
                                nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                queryText: z.ZodOptional<z.ZodString>;
                                k: z.ZodOptional<z.ZodNumber>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                                engineParams: z.ZodOptional<z.ZodObject<{
                                    [x: string]: z.ZodOptional<z.ZodUnknown>;
                                }, z.core.$strict>>;
                            } | {
                                distanceThreshold: z.ZodOptional<z.ZodNumber>;
                                ef: z.ZodOptional<z.ZodNumber>;
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                mode: z.ZodLiteral<"semantic">;
                                vectorField: z.ZodString;
                                nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                queryText: z.ZodOptional<z.ZodString>;
                                k: z.ZodOptional<z.ZodNumber>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                                engineParams?: undefined;
                            }, z.core.$strip> | z.ZodObject<{
                                distanceThreshold: z.ZodOptional<z.ZodNumber>;
                                ef: z.ZodOptional<z.ZodNumber>;
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                mode: z.ZodLiteral<"hybrid">;
                                query: z.ZodString;
                                vectorField: z.ZodString;
                                nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                alpha: z.ZodOptional<z.ZodNumber>;
                                k: z.ZodOptional<z.ZodNumber>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                                queryBy?: z.ZodOptional<z.ZodArray<z.ZodString>> | undefined;
                                engineParams: z.ZodOptional<z.ZodObject<{
                                    [x: string]: z.ZodOptional<z.ZodUnknown>;
                                }, z.core.$strict>>;
                            } | {
                                distanceThreshold: z.ZodOptional<z.ZodNumber>;
                                ef: z.ZodOptional<z.ZodNumber>;
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                mode: z.ZodLiteral<"hybrid">;
                                query: z.ZodString;
                                vectorField: z.ZodString;
                                nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                alpha: z.ZodOptional<z.ZodNumber>;
                                k: z.ZodOptional<z.ZodNumber>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                                queryBy?: z.ZodOptional<z.ZodArray<z.ZodString>> | undefined;
                                engineParams?: undefined;
                            }, z.core.$strip> | z.ZodObject<{
                                [x: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                            }, z.core.$strip>, ...(z.ZodObject<{
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                engineParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                                mode: z.ZodLiteral<"keyword">;
                                query: z.ZodOptional<z.ZodString>;
                                queryBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlight: z.ZodOptional<z.ZodBoolean>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                            }, z.core.$strip> | z.ZodObject<{
                                distanceThreshold: z.ZodOptional<z.ZodNumber>;
                                ef: z.ZodOptional<z.ZodNumber>;
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                engineParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                                mode: z.ZodLiteral<"semantic">;
                                vectorField: z.ZodString;
                                nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                queryText: z.ZodOptional<z.ZodString>;
                                k: z.ZodOptional<z.ZodNumber>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                            }, z.core.$strip> | z.ZodObject<{
                                distanceThreshold: z.ZodOptional<z.ZodNumber>;
                                ef: z.ZodOptional<z.ZodNumber>;
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                engineParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                                mode: z.ZodLiteral<"hybrid">;
                                query: z.ZodString;
                                queryBy: z.ZodArray<z.ZodString>;
                                vectorField: z.ZodString;
                                nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                alpha: z.ZodOptional<z.ZodNumber>;
                                k: z.ZodOptional<z.ZodNumber>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                            }, z.core.$strip> | z.ZodObject<{
                                mode: z.ZodLiteral<"raw">;
                                params: z.ZodRecord<z.ZodString, z.ZodAny>;
                            }, z.core.$strip> | z.ZodObject<{
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                mode: z.ZodLiteral<"keyword">;
                                query: z.ZodOptional<z.ZodString>;
                                queryBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlight: z.ZodOptional<z.ZodBoolean>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
                                    offset: z.ZodOptional<z.ZodNumber>;
                                    skip: z.ZodOptional<z.ZodNumber>;
                                }, z.core.$strip>>;
                                engineParams: z.ZodOptional<z.ZodObject<{
                                    [x: string]: z.ZodOptional<z.ZodUnknown>;
                                }, z.core.$strict>>;
                            } | {
                                facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                facetQuery: z.ZodOptional<z.ZodString>;
                                maxFacetValues: z.ZodOptional<z.ZodNumber>;
                                highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlightStartTag: z.ZodOptional<z.ZodString>;
                                highlightEndTag: z.ZodOptional<z.ZodString>;
                                snippetThreshold: z.ZodOptional<z.ZodNumber>;
                                groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                groupLimit: z.ZodOptional<z.ZodNumber>;
                                groupMissingValues: z.ZodOptional<z.ZodBoolean>;
                                queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                                mode: z.ZodLiteral<"keyword">;
                                query: z.ZodOptional<z.ZodString>;
                                queryBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                highlight: z.ZodOptional<z.ZodBoolean>;
                                filter: z.ZodOptional<z.ZodObject<{
                                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
                                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                                    limit: z.ZodOptional<z.ZodNumber>;
// ... cut
```

Source: `packages/connectors/src/search/core/controllers/factory.ts`

## `SearchControllerOptionsUtility`

*class*

Reads every option of `SearchControllerFactory.build` in one place, applies its defaults and makes every cross-check. Throws `[scope] what | why`, so a bad definition never boots.

```ts
export declare class SearchControllerOptionsUtility {
    private static fail;
    /** What the model says about its fields: names and types, the hidden ones, and `defaultQueryBy`. */
    static readCatalog(opts: {
        scope: string;
        entityClass: TClass<AbstractEntity>;
    }): ISearchFieldCatalog;
    /** The `request.headers` schema of a route that is on, when it names one: it must be a Zod object schema. */
    private static readHeaders;
    /** `inject` names classes only: a key, an instance or an optional dependency is not declared here. */
    private static assertInject;
    /** `authenticate` is required: a route is open only by an explicit `{ skip: true }`. */
    private static resolveAuthenticate;
    /** One `query.fixed` or `query.default`: a function is kept for the request, a value is checked now. */
    private static resolveSource;
    static resolve<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}>(opts: {
        scope: string;
        options: ISearchOptionsInput;
        entityClass: TClass<AbstractEntity>;
    }): ISearchResolvedOptions<RouteEnv, TExtra, Inject>;
}
```

Source: `packages/connectors/src/search/core/controllers/options.ts`
