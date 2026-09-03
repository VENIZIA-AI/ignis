import { buildQuerySchemas, type TSchemaDecorator } from '@venizia/ignis-filter/schemas';

/** Load order is the point: `@hono/zod-openapi` peers on `zod`, so importing it patches `.openapi()` onto the shared `ZodType` prototype. `buildQuerySchemas` runs at module scope below, and ESM evaluates imports first, so the method exists by the time the decorator is called. Without this import the schemas silently build undecorated whenever this module happens to load before anything else pulls in the OpenAPI layer. */
import { z } from '@hono/zod-openapi';

/** The schemas themselves live in `@venizia/ignis-filter`, built with plain `zod` so a browser can use them. Documentation metadata is injected here because it is a server concern - `.openapi()` returns a new schema rather than mutating, and three of the decorations sit on inner nodes, so they cannot be applied after the tree is composed. */
const openApiDecorator: TSchemaDecorator = (schema, metadata) => {
  return (schema as any).openapi(metadata);
};

export const {
  FieldsSchema,
  FilterSchema,
  InclusionSchema,
  LimitSchema,
  OffsetSchema,
  OrderBySchema,
  SkipSchema,
  WhereSchema,
} = buildQuerySchemas({ decorate: openApiDecorator });

/**
 * The query shape of a route that accepts a `filter`. The framework's own `find`, `findById` and
 * `findOne` use it, and a hand-written route gets the same contract by naming it.
 *
 * `filter` needs no `.optional()` at the call site - {@link FilterSchema} already carries one, so a
 * second is a no-op and so is a trailing `.partial()`.
 *
 * Extend it rather than rebuilding it when a route takes more than `filter`:
 * `FilterQuerySchema.extend({ q: z.string().optional() })`.
 */
export const FilterQuerySchema = z.object({ filter: FilterSchema }).openapi({
  description: 'Filter with where, fields, limit, skip, order, include',
});

/**
 * The query shape of a route that accepts conditions and nothing else - `count` and anything shaped
 * like it. `where` is OPTIONAL here.
 *
 * `updateBy` and `deleteBy` deliberately do not use this. They require `where`, because a missing
 * one there rewrites or deletes every row in the table.
 */
export const WhereQuerySchema = z.object({ where: WhereSchema.optional() }).openapi({
  description: 'Filter conditions',
});
