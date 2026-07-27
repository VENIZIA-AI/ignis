import { buildQuerySchemas, type TSchemaDecorator } from '@venizia/ignis-filter/schemas';

/** Side-effect import, and load order is the point: `@hono/zod-openapi` peers on `zod`, so importing it patches `.openapi()` onto the shared `ZodType` prototype. `buildQuerySchemas` runs at module scope below, and ESM evaluates imports first, so the method exists by the time the decorator is called. Without this line the schemas silently build undecorated whenever this module happens to load before anything else pulls in the OpenAPI layer. */
import '@hono/zod-openapi';

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
