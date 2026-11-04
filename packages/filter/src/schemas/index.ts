import { QuerySchemaFactory } from './builder';

export * from './builder';
export * from './common';

/** Ready-to-use schemas with no documentation metadata attached - the browser case, and the reason most consumers never touch `QuerySchemaFactory.build` directly. */
const schemas = QuerySchemaFactory.build();

/** Field selection: an array of names to include, or an object of `name: boolean`. Optional. */
export const FieldsSchema = schemas.FieldsSchema;

/** The whole filter: `where`, `fields`, `include`, `order`, `limit`, `offset` and `skip`. Accepts an object or a JSON string; a malformed string becomes a validation issue. */
export const FilterSchema = schemas.FilterSchema;

/** The `include` array: each entry names a `relation` and may carry a nested `scope` filter. Optional. */
export const InclusionSchema = schemas.InclusionSchema;

/** Maximum number of rows; a non-negative integer, optional. */
export const LimitSchema = schemas.LimitSchema;

/** Number of rows to offset for pagination; a non-negative integer, optional. */
export const OffsetSchema = schemas.OffsetSchema;

/** Sort order as strings such as `createdAt DESC`; JSON paths like `metadata.priority DESC` are allowed. Optional. */
export const OrderBySchema = schemas.OrderBySchema;

/** Number of rows to skip for pagination; a non-negative integer, optional. */
export const SkipSchema = schemas.SkipSchema;

/** Query conditions with nested `and` / `or`. Accepts an object or a JSON string; a malformed string becomes a validation issue. */
export const WhereSchema = schemas.WhereSchema;
