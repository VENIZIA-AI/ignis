import { buildQuerySchemas } from './builder';

export * from './builder';
export * from './common';

/** Ready-to-use schemas with no documentation metadata attached - the browser case, and the reason most consumers never touch `buildQuerySchemas` directly. */
export const {
  FieldsSchema,
  FilterSchema,
  InclusionSchema,
  LimitSchema,
  OffsetSchema,
  OrderBySchema,
  SkipSchema,
  WhereSchema,
} = buildQuerySchemas();
