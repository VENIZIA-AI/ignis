import type { IRelationalTransaction } from '@/relational/core/datasources/common';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { TConformanceRepository } from './repository-conformance';

type TFindEveryRepository = Pick<
  TConformanceRepository,
  'find' | 'findEvery' | 'createAll' | 'deleteById'
>;

export interface IFindEveryHarness {
  /** Table `items`, scoped to the current tenant, `deletedAt` null by default, `secret` hidden. */
  scoped: TFindEveryRepository;
  /** Table `items` with no scope, no default filter, nothing hidden, `limit.max` 20 000. */
  open: TFindEveryRepository;
  /** Table `items` with `limit.max` 3. */
  capped: TFindEveryRepository;
  hiddenKey: TFindEveryRepository;
  /** Primary key `(id, tenant)`. */
  composite: TFindEveryRepository;
  setTenant(tenant: string): void;
  reset(): Promise<void>;
  beginTransaction(): Promise<IRelationalTransaction<AnyType>>;
}

const pagesOf = async <T>(pages: AsyncIterable<Array<T>>): Promise<Array<Array<T>>> => {
  const all: Array<Array<T>> = [];

  for await (const page of pages) {
    all.push(page);
  }

  return all;
};

const idsOf = (pages: Array<Array<{ id: unknown }>>) =>
  pages.map((page) => page.map((row) => row.id));

/** Runs `run` with `find` spied on: each page is one `find` call. */
const withFinds = async <T>(opts: { repository: TFindEveryRepository; run: () => Promise<T> }) => {
  const find = spyOn(opts.repository, 'find');

  try {
    const result = await opts.run();

    return { result, calls: find.mock.calls };
  } finally {
    find.mockRestore();
  }
};

const expectBadRequest = async (opts: {
  repository: TFindEveryRepository;
  task: () => Promise<unknown>;
  message: RegExp;
}) => {
  const { result: reason, calls } = await withFinds({
    repository: opts.repository,
    run: () => RejectionHelper.rejectionOf({ task: opts.task() }),
  });

  expect(isApplicationError(reason) && reason.statusCode).toBe(HTTP.ResultCodes.RS_4.BadRequest);
  expect(reason instanceof Error ? reason.message : '').toMatch(opts.message);
  expect(calls).toHaveLength(0);
};

const rowsOf = (opts: { ids: Array<number>; tenant?: string; deletedAt?: Date }) =>
  opts.ids.map((id) => ({
    id,
    tenant: opts.tenant ?? 'a',
    name: `n-${id}`,
    secret: 'x',
    deletedAt: opts.deletedAt ?? null,
  }));

/** `findEvery` on a real engine: the pages a caller sees and how many `find` calls they cost. */
export const runFindEveryConformance = (opts: {
  engine: string;
  build: () => IFindEveryHarness;
}): void => {
  describe(`findEvery - ${opts.engine}`, () => {
    let harness: IFindEveryHarness;

    const seed = async (rows: Array<Record<string, unknown>>) => {
      await harness.open.createAll({ data: rows, options: { shouldReturn: false } });
    };

    const pagesWithFinds = (pageSize: number) =>
      withFinds({
        repository: harness.scoped,
        run: () => pagesOf(harness.scoped.findEvery({ pageSize })),
      });

    beforeEach(async () => {
      harness = opts.build();
      harness.setTenant('a');
      await harness.reset();
    });

    test('yields pages in key order, one find each, an extra empty one after a full last page, none after a break', async () => {
      const empty = await pagesWithFinds(2);

      await seed(rowsOf({ ids: [1, 2, 3, 4] }));

      const shorter = await pagesWithFinds(3);
      const full = await pagesWithFinds(2);
      const left = await withFinds({
        repository: harness.scoped,
        run: async () => {
          for await (const page of harness.scoped.findEvery({ pageSize: 2 })) {
            return page;
          }

          return [];
        },
      });

      expect(empty.result).toEqual([]);
      expect(empty.calls).toHaveLength(1);
      expect(idsOf(shorter.result)).toEqual([[1, 2, 3], [4]]);
      expect(shorter.calls).toHaveLength(2);
      expect(idsOf(full.result)).toEqual([
        [1, 2],
        [3, 4],
      ]);
      expect(full.calls).toHaveLength(3);
      expect(left.result).toHaveLength(2);
      expect(left.calls).toHaveLength(1);
    });

    test("the page size is 500 by default, lowered to the model's limit.max", async () => {
      await seed(rowsOf({ ids: Array.from({ length: 501 }, (_unused, index) => index + 1) }));

      const plain = await pagesOf(harness.scoped.findEvery({}));
      const capped = await pagesOf(harness.capped.findEvery({}));

      expect(plain.map((page) => page.length)).toEqual([500, 1]);
      expect(capped).toHaveLength(167);
      expect(capped.flat()).toHaveLength(501);
    });

    test('the where, row scope, default filter and hidden fields apply to every page', async () => {
      await seed([
        ...rowsOf({ ids: [1, 2, 3] }),
        ...rowsOf({ ids: [4, 5], tenant: 'b' }),
        ...rowsOf({ ids: [6], deletedAt: new Date() }),
        ...rowsOf({ ids: [7, 8] }),
      ]);

      const pages = await pagesOf(harness.scoped.findEvery({ pageSize: 2 }));
      const withDeleted = await pagesOf(
        harness.scoped.findEvery({ pageSize: 2, options: { shouldSkipDefaultFilter: true } }),
      );
      const narrowed = await pagesOf(
        harness.scoped.findEvery({
          filter: { where: { or: [{ id: 2 }, { id: 4 }, { id: 7 }] } },
          pageSize: 1,
        }),
      );

      expect(idsOf(pages)).toEqual([[1, 2], [3, 7], [8]]);
      expect(pages.flat().some((row) => 'secret' in row)).toBe(false);
      expect(idsOf(withDeleted).flat()).toEqual([1, 2, 3, 6, 7, 8]);
      expect(idsOf(narrowed)).toEqual([[2], [7]]);
    });

    test('fields without the key page by the key and leave it out of the rows', async () => {
      await seed(rowsOf({ ids: [1, 2, 3] }));

      const asList = await pagesOf(
        harness.scoped.findEvery({ filter: { fields: ['name'] }, pageSize: 2 }),
      );
      const asMap = await pagesOf(
        harness.scoped.findEvery({ filter: { fields: { name: true, id: false } }, pageSize: 2 }),
      );
      const withKey = await pagesOf(
        harness.scoped.findEvery({ filter: { fields: ['id', 'name'] }, pageSize: 2 }),
      );

      expect(asList).toEqual([[{ name: 'n-1' }, { name: 'n-2' }], [{ name: 'n-3' }]]);
      expect(asMap).toEqual(asList);
      expect(withKey.flat()).toEqual(
        rowsOf({ ids: [1, 2, 3] }).map(({ id, name }) => ({ id, name })),
      );
    });

    test('rows inserted or deleted mid-loop never shift the window', async () => {
      await seed(rowsOf({ ids: [10, 20, 30, 40, 50, 60] }));

      const seen: Array<Array<unknown>> = [];

      for await (const page of harness.scoped.findEvery({ pageSize: 2 })) {
        seen.push(page.map((row) => row.id));

        if (seen.length === 1) {
          await seed(rowsOf({ ids: [5, 25, 70] }));
          await harness.open.deleteById({ id: 30, options: { shouldReturn: false } });
        }
      }

      expect(seen).toEqual([[10, 20], [25, 40], [50, 60], [70]]);
    });

    test('every page reads through options.transaction', async () => {
      await seed(rowsOf({ ids: [1, 2, 3, 4, 5] }));
      const transaction = await harness.beginTransaction();

      try {
        const { result, calls } = await withFinds({
          repository: harness.scoped,
          run: () => pagesOf(harness.scoped.findEvery({ pageSize: 2, options: { transaction } })),
        });

        expect(result.flat()).toHaveLength(5);
        expect(calls).toHaveLength(3);
        expect(calls.every(([call]) => call.options?.transaction === transaction)).toBe(true);
      } finally {
        await transaction.rollback();
      }
    });

    test.each([
      ['order', { where: {}, order: ['id DESC'] }],
      ['limit', { where: {}, limit: 1 }],
      ['skip', { where: {}, skip: 1 }],
      ['offset', { where: {}, offset: 1 }],
      ['include', { where: {}, include: [{ relation: 'anything' }] }],
    ])('a filter with %s is a 400 before any find', async (key, filter) => {
      await expectBadRequest({
        repository: harness.scoped,
        task: () => pagesOf(harness.scoped.findEvery({ filter })),
        message: new RegExp(`Refused filter key\\(s\\): ${key}`),
      });
    });

    test.each([
      ...[0, -1, 1.5, Number.NaN, 1001, Number.POSITIVE_INFINITY].map(
        (pageSize) =>
          [
            'scoped',
            pageSize,
            /Invalid 'pageSize' \| Expected an integer from 1 to 1000 /,
          ] as const,
      ),
      ['open', 10_001, /Expected an integer from 1 to 10000 /],
      ['capped', 4, /Expected an integer from 1 to 3 /],
      ['hiddenKey', 1, /The key 'id' of '.+' is a hidden property/],
      ['composite', 1, /Needs a single-column primary key/],
    ] as const)(
      'the %s model refuses a pageSize of %p with a 400 before any find',
      async (name, pageSize, message) => {
        await expectBadRequest({
          repository: harness[name],
          task: () => pagesOf(harness[name].findEvery({ pageSize })),
          message,
        });
      },
    );
  });
};
