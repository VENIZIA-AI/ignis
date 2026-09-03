import { z } from 'zod';

import type { TSchemaDecorator } from './common/types';

/** The schemas are built by a factory rather than declared at module scope because documentation metadata has to be injected. `.openapi()` returns a NEW schema instead of mutating, and three of these decorations sit on inner nodes of a nested tree, so a consumer cannot annotate them after the tree is composed - the outer node would still hold the undecorated children. */
/** Built with plain `zod`, never `@hono/zod-openapi`: the OpenAPI layer pulls in Hono, and these schemas must stay usable in a browser. `@hono/zod-openapi` declares `zod` as a peer, so it patches the same prototype - a server that imports it can decorate these schemas even though they were built without it. */

const identityDecorator: TSchemaDecorator = schema => schema;

export const buildQuerySchemas = (opts?: { decorate?: TSchemaDecorator }) => {
  const decorate = opts?.decorate ?? identityDecorator;

  /**
   * `int().nonnegative()`, not a bare `number()`. A NEGATIVE limit is not a smaller page - Drizzle
   * renders the LIMIT clause only when the value is `>= 0`, so `filter={"limit":-1}` emitted a
   * `select` with no LIMIT at all and returned the whole table. A fractional limit reaches the
   * driver as `LIMIT 1.5` and errors there instead of here.
   */
  const LimitSchema = decorate(z.number().int().nonnegative().optional(), {
    description: 'Maximum number of items to return. Defaults to 10 for top-level list queries.',
    examples: [1, 2, 3],
  });

  const OffsetSchema = decorate(z.number().int().nonnegative().optional(), {
    description: 'Number of items to offset for pagination.',
    examples: [1, 2, 3],
  });

  const SkipSchema = decorate(z.number().int().nonnegative().optional(), {
    description: 'Number of items to skip for pagination.',
    examples: [1, 2, 3],
  });

  const OrderBySchema = decorate(z.array(z.string()).optional(), {
    description:
      "Sorting order for results. Supports regular columns ('fieldName ASC') and JSON/JSONB paths ('metadata.field DESC', 'data.nested[0].value ASC').",
    examples: [
      'id DESC',
      'createdAt ASC',
      'metadata.priority DESC',
      'data.nested.value ASC',
      'items[0].score DESC',
    ],
  });

  const FieldsSchema = decorate(
    z.record(z.string(), z.boolean()).or(z.array(z.string())).optional(),
    {
      description:
        'Fields selection - either an array of field names to include, or an object with field names as keys and boolean values (true to include, false to exclude)',
      examples: [
        JSON.stringify(['id', 'name', 'email']),
        JSON.stringify({ id: true, name: true }),
        JSON.stringify({ id: true, name: true, email: true, fullName: false }),
      ],
    },
  );

  /** @internal Recursive schema for where clause validation with nested AND/OR. */
  const RecursiveWhereSchema: z.ZodType<any> = z.lazy(() =>
    z.record(z.string(), z.any()).and(
      z.object({
        and: z.array(RecursiveWhereSchema).optional(),
        or: z.array(RecursiveWhereSchema).optional(),
      }),
    ),
  );

  const WhereSchema = decorate(
    z.union([
      RecursiveWhereSchema,
      z
        .string()
        // A caught parse, never a bare `JSON.parse`. zod lets a thrown SyntaxError escape
        // `safeParse`, so the controller's validation hook never ran and `?where=not-json` surfaced
        // as a 500 with a stack - for what is simply a malformed query string.
        .transform((val, ctx) => {
          if (!val) {
            return undefined;
          }

          try {
            return JSON.parse(val);
          } catch {
            ctx.addIssue({ code: 'custom', message: 'where must be valid JSON' });
            return z.NEVER;
          }
        })
        .pipe(RecursiveWhereSchema),
    ]),
    { type: 'object', description: 'Query conditions for selecting data.' },
  );

  /** Zod schema for including related entities in queries with optional nested filtering. */
  const InclusionSchema = decorate(
    z
      .array(
        z.object({
          relation: decorate(z.string(), { description: 'Model relation name' }),
          scope: decorate(
            z
              .lazy(() => FilterSchema) // eslint-disable-line @typescript-eslint/no-use-before-define
              .optional(),
            { description: 'Model relation filter' },
          ),
          // `shouldSkipDefaultFilter` is deliberately NOT on the wire schema. It stays on the
          // internal `TInclusion` type, so server-side callers keep it, but a client could
          // otherwise send `include[].shouldSkipDefaultFilter` and the relation would be emitted
          // with no where clause at all - erasing the `@model` defaultFilter that implements
          // soft-delete and the static visibility scopes.
        }),
      )
      .optional(),
    {
      description: 'Define related models to include in the response.',
      examples: [
        JSON.stringify({ include: [{ relation: 'posts' }] }),
        JSON.stringify({ include: [{ relation: 'posts', scope: { limit: 5 } }] }),
      ],
    },
  );

  /** @internal Filter schema object definition. */
  const InternalFilterSchema = z.object({
    where: WhereSchema.optional(),
    fields: FieldsSchema,
    include: InclusionSchema,
    order: OrderBySchema,
    limit: LimitSchema,
    offset: OffsetSchema,
    skip: SkipSchema,
  });

  /** Comprehensive Zod schema for repository query filtering. Supports object and JSON string formats. */
  const FilterSchema = decorate(
    z
      .union([
        InternalFilterSchema,
        z
          .string()
          // Same reason as `where` above: a malformed filter is the caller's mistake, so it has to
          // become a validation issue rather than an uncaught throw.
          .transform((val, ctx) => {
            if (!val) {
              return {};
            }

            try {
              return JSON.parse(val);
            } catch {
              ctx.addIssue({ code: 'custom', message: 'filter must be valid JSON' });
              return z.NEVER;
            }
          })
          .pipe(InternalFilterSchema),
      ])
      .optional(),
    {
      type: 'object',
      description:
        'A comprehensive filter object for querying data, including conditions, field selection, relations, pagination, and sorting.',
      examples: [
        JSON.stringify({ where: { name: 'John Doe' }, limit: 10 }),
        JSON.stringify({
          fields: { id: true, name: true, email: true },
          order: ['createdAt DESC'],
        }),
        JSON.stringify({ include: [{ relation: 'posts', scope: { limit: 5 } }] }),
        JSON.stringify({
          where: { or: [{ status: 'active' }, { isPublished: true }] },
          skip: 20,
          limit: 10,
        }),
        JSON.stringify({
          where: { and: [{ role: 'admin' }, { createdAt: { gte: 'YYYY-MM-DD' } }] },
        }),
      ],
    },
  );

  return {
    FieldsSchema,
    FilterSchema,
    InclusionSchema,
    LimitSchema,
    OffsetSchema,
    OrderBySchema,
    SkipSchema,
    WhereSchema,
  };
};

export type TQuerySchemas = ReturnType<typeof buildQuerySchemas>;
