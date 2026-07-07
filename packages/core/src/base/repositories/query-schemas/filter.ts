import { z } from '@hono/zod-openapi';
import { FieldsSchema, TFields } from './fields';
import { LimitSchema } from './limit';
import { OffsetSchema } from './offset';
import { OrderBySchema } from './order-by';
import { SkipSchema } from './skip';
import { TWhere, WhereSchema } from './where';

/** Zod schema for including related entities in queries with optional nested filtering. */
export const InclusionSchema = z
  .array(
    z.object({
      relation: z.string().openapi({ description: 'Model relation name' }),
      scope: z
        .lazy(() => FilterSchema) // eslint-disable-line @typescript-eslint/no-use-before-define
        .optional()
        .openapi({ description: 'Model relation filter' }),
      shouldSkipDefaultFilter: z
        .boolean()
        .optional()
        .openapi({ description: 'Skip the default filter for this relation' }),
    }),
  )
  .optional()
  .openapi({
    description: 'Define related models to include in the response.',
    examples: [
      JSON.stringify({ include: [{ relation: 'posts' }] }),
      JSON.stringify({ include: [{ relation: 'posts', scope: { limit: 5 } }] }),
    ],
  });

/** Single relation inclusion configuration. */
export type TInclusion = {
  relation: string;
  scope?: TFilter;
  shouldSkipDefaultFilter?: boolean;
};

/** @internal Filter schema object definition. */
const _FilterSchema = z.object({
  where: WhereSchema.optional(),
  fields: FieldsSchema,
  include: InclusionSchema,
  order: OrderBySchema,
  limit: LimitSchema,
  offset: OffsetSchema,
  skip: SkipSchema,
});

/** Comprehensive Zod schema for repository query filtering. Supports object and JSON string formats. */
export const FilterSchema = z
  .union([
    _FilterSchema,
    z
      .string()
      .transform(val => {
        if (val) {
          return JSON.parse(val);
        }

        return {};
      })
      .pipe(_FilterSchema),
  ])
  .optional()
  .openapi({
    type: 'object',
    description:
      'A comprehensive filter object for querying data, including conditions, field selection, relations, pagination, and sorting.',
    examples: [
      JSON.stringify({ where: { name: 'John Doe' }, limit: 10 }),
      JSON.stringify({ fields: { id: true, name: true, email: true }, order: ['createdAt DESC'] }),
      JSON.stringify({ include: [{ relation: 'posts', scope: { limit: 5 } }] }),
      JSON.stringify({
        where: { or: [{ status: 'active' }, { isPublished: true }] },
        skip: 20,
        limit: 10,
      }),
      JSON.stringify({ where: { and: [{ role: 'admin' }, { createdAt: { gte: 'YYYY-MM-DD' } }] } }),
    ],
  });

/** Comprehensive filter configuration used across all repository query methods. */
export type TFilter<T = any> = {
  where?: TWhere<T>;
  fields?: TFields;
  include?: TInclusion[];
  order?: string[];
  limit?: number;
  offset?: number;
  skip?: number;
};
