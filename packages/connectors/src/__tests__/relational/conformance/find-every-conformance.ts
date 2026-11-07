import type { IRelationalTransaction } from '@/relational/core/datasources/common';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { ApplicationError } from '@venizia/ignis-helpers/core';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { TConformanceRepository } from './repository-conformance';

export interface IFindEveryRow {
  id: number;
  tenant: string;
  name: string;
  secret?: string;
}

export interface IFindEveryHarness {
  /** Table `items`: scoped to the current tenant, `deletedAt` null by default, `secret` hidden. */
  scoped: TConformanceRepository;
  /** Table `items` with no scope, no default filter and nothing hidden: seeds the rows and changes them between pages. */
  open: TConformanceRepository;
  /** Table `items` with `limit.max` of 3. */
  capped: TConformanceRepository;
  /** Table `items` with `id` hidden. */
  hiddenKey: TConformanceRepository;
  /** A table whose `id` is a text primary key. */
  texts: TConformanceRepository;
  /** A table whose primary key is `id` and `tenant` together. */
  composite: TConformanceRepository;
  setTenant(tenant: string): void;
  /** Empties every table. */
  reset(): Promise<void>;
  beginTransaction(): Promise<IRelationalTransaction<AnyType>>;
}

const collect = async <T>(iterable: AsyncIterable<T>): Promise<Array<T>> => {
  const rows: Array<T> = [];

  for await (const row of iterable) {
    rows.push(row);
  }

  return rows;
};

/** Counts what reaches the database while `run` runs: a `select` or a `findMany` is one query. */
const measure = async <T>(opts: {
  repository: TConformanceRepository;
  run: () => Promise<T>;
}): Promise<{ result: T; queries: number; connectors: Array<unknown> }> => {
  const executor = opts.repository['queryExecutor'];
  const select = spyOn(executor, 'select');
  const findMany = spyOn(executor, 'findMany');

  try {
    const result = await opts.run();
    const calls = [...select.mock.calls, ...findMany.mock.calls];

    return { result, queries: calls.length, connectors: calls.map(([call]) => call.connector) };
  } finally {
    select.mockRestore();
    findMany.mockRestore();
  }
};

const expectBadRequest = async (opts: { task: Promise<unknown>; message: RegExp }) => {
  const reason = await RejectionHelper.rejectionOf({ task: opts.task });

  expect(reason).toBeInstanceOf(ApplicationError);
  expect((reason as ApplicationError).statusCode).toBe(HTTP.ResultCodes.RS_4.BadRequest);
  expect((reason as ApplicationError).message).toMatch(opts.message);
};

const ids = (rows: Array<{ id: unknown }>) => rows.map((row) => row.id);

/** `count` rows of `tenant`, named `<tenant>-<id>`, with the ids `firstId`, `firstId + 1`, ... */
const rowsOf = (opts: { tenant: string; count: number; firstId: number }) =>
  Array.from({ length: opts.count }, (_unused, index) => ({
    id: opts.firstId + index,
    tenant: opts.tenant,
    name: `${opts.tenant}-${opts.firstId + index}`,
    secret: 's3cret',
  }));

/**
 * `findEvery` against a REAL database. Asserts what a caller sees (the rows, their order, how many queries it cost),
 * never an engine's SQL text.
 */
export const runFindEveryConformance = (opts: {
  engine: string;
  build: () => IFindEveryHarness;
}): void => {
  describe(`findEvery - ${opts.engine}`, () => {
    let harness: IFindEveryHarness;

    const seed = async (rows: Array<Record<string, unknown>>) => {
      await harness.open.createAll({ data: rows as AnyType, options: { shouldReturn: false } });
    };

    beforeEach(async () => {
      harness = opts.build();
      harness.setTenant('a');
      await harness.reset();
    });

    describe('paging', () => {
      test('2.5 pages: every row once, in key order, one query per page', async () => {
        await seed(rowsOf({ tenant: 'a', count: 5, firstId: 1 }));

        const { result, queries } = await measure({
          repository: harness.scoped,
          run: () => collect(harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 })),
        });

        expect(ids(result)).toEqual([1, 2, 3, 4, 5]);
        expect(queries).toBe(3);
      });

      test('an exact page boundary costs one more query, which is empty', async () => {
        await seed(rowsOf({ tenant: 'a', count: 4, firstId: 1 }));

        const { result, queries } = await measure({
          repository: harness.scoped,
          run: () => collect(harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 })),
        });

        expect(ids(result)).toEqual([1, 2, 3, 4]);
        expect(queries).toBe(3);
      });

      test('a result that fits one page costs one query', async () => {
        await seed(rowsOf({ tenant: 'a', count: 2, firstId: 1 }));

        const { result, queries } = await measure({
          repository: harness.scoped,
          run: () => collect(harness.scoped.findEvery<IFindEveryRow>({ pageSize: 5 })),
        });

        expect(ids(result)).toEqual([1, 2]);
        expect(queries).toBe(1);
      });

      test('an empty result yields nothing after one query', async () => {
        const { result, queries } = await measure({
          repository: harness.scoped,
          run: () => collect(harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 })),
        });

        expect(result).toEqual([]);
        expect(queries).toBe(1);
      });

      test('the page size is 500 when none is given', async () => {
        await seed(rowsOf({ tenant: 'a', count: 501, firstId: 1 }));

        const { result, queries } = await measure({
          repository: harness.scoped,
          run: () => collect(harness.scoped.findEvery<IFindEveryRow>({})),
        });

        expect(result).toHaveLength(501);
        expect(queries).toBe(2);
      });

      test('a model that caps its limit lowers the default page size to the cap', async () => {
        await seed(rowsOf({ tenant: 'a', count: 5, firstId: 1 }));

        const { result, queries } = await measure({
          repository: harness.capped,
          run: () => collect(harness.capped.findEvery<IFindEveryRow>({})),
        });

        expect(ids(result)).toEqual([1, 2, 3, 4, 5]);
        expect(queries).toBe(2);
      });

      test('a user where narrows the rows, and an or in it does not widen the window', async () => {
        await seed(rowsOf({ tenant: 'a', count: 6, firstId: 1 }));

        const rows = await collect(
          harness.scoped.findEvery<IFindEveryRow>({
            filter: { where: { or: [{ id: 2 }, { id: 3 }, { id: 5 }] } },
            pageSize: 1,
          }),
        );

        expect(ids(rows)).toEqual([2, 3, 5]);
      });
    });

    describe('leaving the loop', () => {
      test('a break after the first page makes no further query', async () => {
        await seed(rowsOf({ tenant: 'a', count: 5, firstId: 1 }));

        const { result, queries } = await measure({
          repository: harness.scoped,
          run: async () => {
            const seen: Array<number> = [];

            for await (const row of harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 })) {
              seen.push(row.id);

              if (seen.length === 2) {
                break;
              }
            }

            return seen;
          },
        });

        expect(result).toEqual([1, 2]);
        expect(queries).toBe(1);
      });

      test('a break on the first row of the next page costs exactly two queries', async () => {
        await seed(rowsOf({ tenant: 'a', count: 5, firstId: 1 }));

        const { result, queries } = await measure({
          repository: harness.scoped,
          run: async () => {
            const seen: Array<number> = [];

            for await (const row of harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 })) {
              seen.push(row.id);

              if (seen.length === 3) {
                break;
              }
            }

            return seen;
          },
        });

        expect(result).toEqual([1, 2, 3]);
        expect(queries).toBe(2);
      });

      test('return() ends the iterator: it is done and queries nothing more', async () => {
        await seed(rowsOf({ tenant: 'a', count: 5, firstId: 1 }));

        const { result, queries } = await measure({
          repository: harness.scoped,
          run: async () => {
            const iterator = harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 });
            const first = await iterator.next();
            await iterator.return(undefined);
            const after = await iterator.next();

            return { first: first.value?.id, done: after.done };
          },
        });

        expect(result).toEqual({ first: 1, done: true });
        expect(queries).toBe(1);
      });
    });

    describe('scope and default filter', () => {
      test('another tenant rows never appear, on any page', async () => {
        await seed([
          ...rowsOf({ tenant: 'a', count: 3, firstId: 1 }),
          ...rowsOf({ tenant: 'b', count: 3, firstId: 4 }),
          ...rowsOf({ tenant: 'a', count: 2, firstId: 7 }),
        ]);

        const mine = await collect(harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 }));
        expect(ids(mine)).toEqual([1, 2, 3, 7, 8]);

        harness.setTenant('b');
        const theirs = await collect(harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 }));
        expect(ids(theirs)).toEqual([4, 5, 6]);
      });

      test('a user where cannot reach past the scope', async () => {
        await seed([
          ...rowsOf({ tenant: 'a', count: 2, firstId: 1 }),
          ...rowsOf({ tenant: 'b', count: 2, firstId: 3 }),
        ]);

        const rows = await collect(
          harness.scoped.findEvery<IFindEveryRow>({
            filter: { where: { or: [{ tenant: 'b' }, { id: 1 }] } },
            pageSize: 1,
          }),
        );

        expect(ids(rows)).toEqual([1]);
      });

      test('soft-deleted rows never appear and never take a place in a page', async () => {
        await seed([
          ...rowsOf({ tenant: 'a', count: 4, firstId: 1 }).map((row) =>
            row.id % 2 === 0 ? { ...row, deletedAt: new Date() } : row,
          ),
          ...rowsOf({ tenant: 'a', count: 2, firstId: 5 }),
        ]);

        const { result, queries } = await measure({
          repository: harness.scoped,
          run: () => collect(harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 })),
        });

        expect(ids(result)).toEqual([1, 3, 5, 6]);
        expect(queries).toBe(3);
      });

      test('shouldSkipDefaultFilter reaches the soft-deleted rows, still inside the scope', async () => {
        await seed([
          { ...rowsOf({ tenant: 'a', count: 1, firstId: 1 })[0], deletedAt: new Date() },
          { ...rowsOf({ tenant: 'b', count: 1, firstId: 2 })[0], deletedAt: new Date() },
          ...rowsOf({ tenant: 'a', count: 1, firstId: 3 }),
        ]);

        const rows = await collect(
          harness.scoped.findEvery<IFindEveryRow>({
            pageSize: 1,
            options: { shouldSkipDefaultFilter: true },
          }),
        );

        expect(ids(rows)).toEqual([1, 3]);
      });
    });

    describe('fields and hidden fields', () => {
      test('a hidden field is never returned', async () => {
        await seed(rowsOf({ tenant: 'a', count: 3, firstId: 1 }));

        const rows = await collect(harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 }));

        expect(rows).toHaveLength(3);
        expect(rows.every((row) => !('secret' in row))).toBe(true);
      });

      test('fields without the key pages by the key and returns rows without it', async () => {
        await seed(rowsOf({ tenant: 'a', count: 5, firstId: 1 }));

        const { result, queries } = await measure({
          repository: harness.scoped,
          run: () =>
            collect(harness.scoped.findEvery({ filter: { fields: ['name'] }, pageSize: 2 })),
        });

        expect(result).toEqual([
          { name: 'a-1' },
          { name: 'a-2' },
          { name: 'a-3' },
          { name: 'a-4' },
          { name: 'a-5' },
        ]);
        expect(queries).toBe(3);
      });

      test('fields as an object, without the key, behaves the same', async () => {
        await seed(rowsOf({ tenant: 'a', count: 3, firstId: 1 }));

        const rows = await collect(
          harness.scoped.findEvery({ filter: { fields: { name: true, id: false } }, pageSize: 2 }),
        );

        expect(rows).toEqual([{ name: 'a-1' }, { name: 'a-2' }, { name: 'a-3' }]);
      });

      test('fields that name the key return it', async () => {
        await seed(rowsOf({ tenant: 'a', count: 3, firstId: 1 }));

        const asArray = await collect(
          harness.scoped.findEvery({ filter: { fields: ['id', 'name'] }, pageSize: 2 }),
        );
        const asObject = await collect(
          harness.scoped.findEvery({ filter: { fields: { id: true, name: true } }, pageSize: 2 }),
        );

        expect(asArray).toEqual([
          { id: 1, name: 'a-1' },
          { id: 2, name: 'a-2' },
          { id: 3, name: 'a-3' },
        ]);
        expect(asObject).toEqual(asArray);
      });
    });

    describe('while the table changes', () => {
      test('a smaller key inserted between pages is not visited, a larger one is, no row twice', async () => {
        await seed(
          [10, 20, 30, 40, 50, 60].map((id) => ({
            id,
            tenant: 'a',
            name: `a-${id}`,
            secret: 'x',
          })),
        );

        const seen: Array<number> = [];

        for await (const row of harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 })) {
          seen.push(row.id);

          if (seen.length === 2) {
            await seed([
              { id: 5, tenant: 'a', name: 'a-5', secret: 'x' },
              { id: 25, tenant: 'a', name: 'a-25', secret: 'x' },
              { id: 70, tenant: 'a', name: 'a-70', secret: 'x' },
            ]);
            await harness.open.deleteById({ id: 30, options: { shouldReturn: false } });
          }
        }

        expect(seen).toEqual([10, 20, 25, 40, 50, 60, 70]);
        expect(new Set(seen).size).toBe(seen.length);
      });
    });

    describe('key types', () => {
      test('a text key pages in the order of the text, never as a number', async () => {
        await harness.texts.createAll({
          data: ['1', '10', '2', '9', 'b'].map((id) => ({ id, name: `n-${id}` })),
          options: { shouldReturn: false },
        });

        const rows = await collect(harness.texts.findEvery<{ id: string }>({ pageSize: 2 }));

        expect(ids(rows)).toEqual(['1', '10', '2', '9', 'b']);
      });

      test('a uuid-shaped text key pages without a row twice or a row lost', async () => {
        const keys = Array.from(
          { length: 7 },
          (_unused, index) => `00000000-0000-4000-8000-00000000000${index}`,
        );
        await harness.texts.createAll({
          data: [...keys].reverse().map((id) => ({ id, name: id })),
          options: { shouldReturn: false },
        });

        const rows = await collect(harness.texts.findEvery<{ id: string }>({ pageSize: 3 }));

        expect(ids(rows)).toEqual(keys);
      });
    });

    describe('transaction', () => {
      test('every page reads through the transaction passed in options', async () => {
        await seed(rowsOf({ tenant: 'a', count: 5, firstId: 1 }));
        const transaction = await harness.beginTransaction();

        try {
          const plain = await measure({
            repository: harness.scoped,
            run: () =>
              collect(
                harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2, options: { transaction } }),
              ),
          });
          const narrowed = await measure({
            repository: harness.scoped,
            run: () =>
              collect(
                harness.scoped.findEvery({
                  filter: { fields: ['name'] },
                  pageSize: 2,
                  options: { transaction },
                }),
              ),
          });

          expect(plain.queries).toBe(3);
          expect(plain.connectors.every((connector) => connector === transaction.connector)).toBe(
            true,
          );
          expect(narrowed.queries).toBe(3);
          expect(
            narrowed.connectors.every((connector) => connector === transaction.connector),
          ).toBe(true);
        } finally {
          await transaction.rollback();
        }
      });

      test('the pool connector is used when no transaction is given', async () => {
        await seed(rowsOf({ tenant: 'a', count: 3, firstId: 1 }));
        const transaction = await harness.beginTransaction();

        try {
          const { connectors } = await measure({
            repository: harness.scoped,
            run: () => collect(harness.scoped.findEvery<IFindEveryRow>({ pageSize: 2 })),
          });

          expect(connectors.every((connector) => connector !== transaction.connector)).toBe(true);
        } finally {
          await transaction.rollback();
        }
      });
    });

    describe('refusals', () => {
      test.each([
        ['order', { order: ['id DESC'] }],
        ['limit', { limit: 10 }],
        ['skip', { skip: 1 }],
        ['offset', { offset: 1 }],
        ['include', { include: [{ relation: 'anything' }] }],
      ])('a filter with %s is a 400, before any query', async (key, filter) => {
        await seed(rowsOf({ tenant: 'a', count: 3, firstId: 1 }));

        const { queries } = await measure({
          repository: harness.scoped,
          run: async () => {
            await expectBadRequest({
              task: collect(harness.scoped.findEvery({ filter: filter as AnyType })),
              message: new RegExp(`Refused filter key\\(s\\): ${key}`),
            });
          },
        });

        expect(queries).toBe(0);
      });

      test.each([0, -1, 1.5, Number.NaN, '5', 10_001, Number.POSITIVE_INFINITY])(
        'a pageSize of %p is a 400, before any query',
        async (pageSize) => {
          const { queries } = await measure({
            repository: harness.scoped,
            run: async () => {
              await expectBadRequest({
                task: collect(harness.scoped.findEvery({ pageSize: pageSize as AnyType })),
                message: /Invalid 'pageSize'/,
              });
            },
          });

          expect(queries).toBe(0);
        },
      );

      test("a pageSize above the model's limit.max is a 400", async () => {
        await expectBadRequest({
          task: collect(harness.capped.findEvery({ pageSize: 4 })),
          message: /Expected an integer from 1 to 3/,
        });
      });

      test('a hidden key is refused: a page cannot continue from a key it never reads', async () => {
        await expectBadRequest({
          task: collect(harness.hiddenKey.findEvery({ pageSize: 2 })),
          message: /The key 'id' of '.+' is a hidden property/,
        });
      });

      test('a composite primary key is refused: id alone does not identify a row', async () => {
        await harness.composite.createAll({
          data: [
            { id: 1, tenant: 'a', name: 'x' },
            { id: 1, tenant: 'b', name: 'y' },
          ],
          options: { shouldReturn: false },
        });

        const { queries } = await measure({
          repository: harness.composite,
          run: async () => {
            await expectBadRequest({
              task: collect(harness.composite.findEvery({ pageSize: 1 })),
              message: /Needs a single-column primary key/,
            });
          },
        });

        expect(queries).toBe(0);
      });
    });
  });
};
