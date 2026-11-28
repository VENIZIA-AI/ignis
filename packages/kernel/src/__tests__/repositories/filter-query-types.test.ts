// The parsed filter of `FilterQuerySchema` goes to a repository as it is. The typecheck is the test of the types.
import type { IAuthRouteConfig, TContextOf } from '@/base/controllers';
import { OpenApiResponses } from '@/base/models';
import { FilterQuerySchema } from '@/base/repositories/query-schemas';
import type { FieldsSchema, FilterSchema } from '@/base/repositories/query-schemas';
import type { IReadableRepository } from '@/repository';
import { z } from '@hono/zod-openapi';
import type { TByIdFilter, TFilter } from '@venizia/ignis-filter';
import type { TNullable } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

type TSame<Left, Right> =
  (<Probe>() => Probe extends Left ? 1 : 2) extends <Probe>() => Probe extends Right ? 1 : 2
    ? true
    : false;

const check = <Holds extends true>(): Holds | undefined => undefined;

const responses = OpenApiResponses.jsonResponse({ schema: z.object({ name: z.string() }) });

const FIND = {
  method: 'get',
  path: '/',
  request: { query: FilterQuerySchema },
  responses,
} satisfies IAuthRouteConfig;

const FIND_WITH_SEARCH = {
  method: 'get',
  path: '/search',
  request: { query: FilterQuerySchema.extend({ q: z.string().optional() }) },
  responses,
} satisfies IAuthRouteConfig;

type TProduct = { id: string; name: string; price: number; tags: string[] };

declare const products: IReadableRepository<TProduct>;

const filtered = async (context: TContextOf<typeof FIND>) => {
  const { filter = {} } = context.req.valid('query');
  const typed: TFilter<TProduct> = filter;
  const byId: TByIdFilter<TProduct> = filter;

  const many = await products.find({ filter });
  const one = await products.findOne({ filter });
  const found = await products.findById({ id: 'a', filter });

  check<TSame<typeof many, TProduct[]>>();
  check<TSame<typeof one, TNullable<TProduct>>>();
  check<TSame<typeof found, TNullable<TProduct>>>();

  return [typed, byId];
};

const extended = (context: TContextOf<typeof FIND_WITH_SEARCH>) => {
  const { filter = {} } = context.req.valid('query');

  return products.find({ filter });
};

/** What a request may send is unchanged, and `filter` and `fields` stay optional. */
const shapes = () => {
  check<TSame<z.input<typeof FieldsSchema>, Record<string, boolean> | string[] | undefined>>();

  const noFilter: z.output<typeof FilterQuerySchema> = {};
  const noFields: z.output<typeof FilterSchema> = {};
  const sent: z.input<typeof FilterQuerySchema> = { filter: '{"limit":1}' };
  // @ts-expect-error the schema's input names the filter keys
  const unknownKey: z.input<typeof FilterQuerySchema> = { filter: { limits: 1 } };
  // @ts-expect-error a field selection sent as a number
  const badFields: z.input<typeof FieldsSchema> = 1;

  return [noFilter, noFields, sent, unknownKey, badFields];
};

/** A hand-written filter is still checked against the model. */
const handWritten = async () => {
  // @ts-expect-error 'nmae' is not a column
  const where: TFilter<TProduct> = { where: { nmae: 'x' } };
  // @ts-expect-error `price` is a number
  const value: TFilter<TProduct> = { where: { price: 'x' } };
  // @ts-expect-error 'nmae' is not a column
  const fields: TFilter<TProduct> = { fields: ['nmae'] };
  // @ts-expect-error 'nmae' is not a column
  const selected: TByIdFilter<TProduct> = { fields: { nmae: true } };
  // @ts-expect-error 'nmae' is not a column
  await products.find({ filter: { fields: ['nmae'] } });
  // @ts-expect-error 'nmae' is not a column
  await products.findOne({ filter: { where: { nmae: 'x' } } });
  // @ts-expect-error 'nmae' is not a column
  await products.findById({ id: 'a', filter: { fields: ['nmae'] } });

  return [where, value, fields, selected];
};

describe('FilterQuerySchema types', () => {
  test('are checked by the typecheck', () => {
    expect([filtered, extended, shapes, handWritten]).toHaveLength(4);
  });
});
