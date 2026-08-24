import { describe, expect, test } from 'bun:test';
import { z } from '@hono/zod-openapi';

import {
  defineControllerRouteConfigs,
  FilterQuerySchema,
  FilterSchema,
  WhereQuerySchema,
  WhereSchema,
} from '@venizia/ignis-kernel';

const SelectSchema = z.object({ id: z.string() });

/** All these assertions need off a route's query schema. The concrete zod type differs per route - `where` is optional on some and required on others - and naming it buys the test nothing. */
type TQueryParser = { safeParse: (input: unknown) => { success: boolean } };

const queryOf = (request: unknown): TQueryParser => (request as { query: TQueryParser }).query;

/** The public entry point, so these assertions cover the wiring an application actually reaches. */
const buildRoutes = (opts: { isStrict: boolean }) =>
  defineControllerRouteConfigs({
    isStrict: opts.isStrict,
    idType: 'string',
    schema: { select: SelectSchema, create: SelectSchema, update: SelectSchema },
  });

describe('FilterQuerySchema', () => {
  test('an absent filter is valid - a bare list call needs no query string', () => {
    expect(FilterQuerySchema.safeParse({}).success).toBe(true);
  });

  test('a filter object is valid', () => {
    expect(FilterQuerySchema.safeParse({ filter: { limit: 5 } }).success).toBe(true);
  });

  // The reason the wrapper exists. Applications were writing
  // `z.object({ filter: FilterSchema.optional() }).partial()`, which is the same schema written
  // longer: `FilterSchema` already carries `.optional()`, so the second one and the `.partial()`
  // are both no-ops. Pinned so nobody re-introduces the longer form believing it does something.
  test('it accepts exactly what the hand-written .optional().partial() form accepted', () => {
    const handWritten = z.object({ filter: FilterSchema.optional() }).partial();

    for (const input of [{}, { filter: {} }, { filter: { limit: 5 } }, { filter: '{"limit":5}' }]) {
      expect(FilterQuerySchema.safeParse(input).success).toBe(handWritten.safeParse(input).success);
    }
  });

  test('extend composes without rebuilding the shape', () => {
    const composed = FilterQuerySchema.extend({ q: z.string().max(255).optional() });

    expect(composed.safeParse({}).success).toBe(true);
    expect(composed.safeParse({ q: 'abc' }).success).toBe(true);
    expect(composed.safeParse({ filter: { limit: 5 }, q: 'abc' }).success).toBe(true);
  });
});

describe('WhereQuerySchema', () => {
  test('an absent where is valid', () => {
    expect(WhereQuerySchema.safeParse({}).success).toBe(true);
  });

  test('a where object is valid', () => {
    expect(WhereQuerySchema.safeParse({ where: { status: 'active' } }).success).toBe(true);
  });

  test('it accepts exactly what the hand-written .optional().partial() form accepted', () => {
    const handWritten = z.object({ where: WhereSchema.optional() }).partial();

    for (const input of [{}, { where: {} }, { where: { status: 'active' } }]) {
      expect(WhereQuerySchema.safeParse(input).success).toBe(handWritten.safeParse(input).success);
    }
  });

  test('extend composes without rebuilding the shape', () => {
    const composed = WhereQuerySchema.extend({ q: z.string().max(255).optional() });

    expect(composed.safeParse({ q: 'abc' }).success).toBe(true);
    expect(composed.safeParse({ where: { status: 'active' }, q: 'abc' }).success).toBe(true);
  });
});

describe('the CRUD factory routes keep the contract they had', () => {
  const routes = buildRoutes({ isStrict: true });

  test.each(['FIND', 'FIND_BY_ID', 'FIND_ONE'] as const)(
    '%s takes no query string, and accepts a filter',
    routeName => {
      const query = queryOf(routes[routeName].request);

      expect(query.safeParse({}).success).toBe(true);
      expect(query.safeParse({ filter: { limit: 5 } }).success).toBe(true);
    },
  );

  // Deliberate, and NOT the same decision as `count`. A missing `where` on a mass update or a mass
  // delete touches every row in the table, so these two require it unconditionally - which is why
  // they do not use `WhereQuerySchema`.
  test.each(['UPDATE_BY', 'DELETE_BY'] as const)('%s still REQUIRES where', routeName => {
    const query = queryOf(routes[routeName].request);

    expect(query.safeParse({}).success).toBe(false);
    expect(query.safeParse({ where: { id: '1' } }).success).toBe(true);
  });

  // Unchanged on purpose. Under the default `isStrict.requestSchema`, `GET /x/count` with no query
  // string is refused and the caller must send `?where={}`. Reviewed and left as it is; this test
  // exists so that a change to it is a decision rather than an accident.
  test('count still requires where under isStrict, and not without it', () => {
    const strict = queryOf(routes.COUNT.request);
    const loose = queryOf(buildRoutes({ isStrict: false }).COUNT.request);

    expect(strict.safeParse({}).success).toBe(false);
    expect(strict.safeParse({ where: {} }).success).toBe(true);
    expect(loose.safeParse({}).success).toBe(true);
  });
});
