import { QuerySchemaFactory } from './builder';

export * from './builder';
export * from './common';

/** Ready-to-use schemas with no documentation metadata attached - the browser case, and the reason most consumers never touch `QuerySchemaFactory.build` directly. */
export const {
  FieldsSchema,
  FilterSchema,
  InclusionSchema,
  LimitSchema,
  OffsetSchema,
  OrderBySchema,
  SkipSchema,
  WhereSchema,
} = QuerySchemaFactory.build();
