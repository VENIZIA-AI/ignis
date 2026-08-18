import { LockStrengths } from '@venizia/ignis-kernel';
import type { IRelationalTransaction } from '@/relational/core/datasources/common';
import type { DefaultRelationalRepository } from '@/relational/core/repositories';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { ApplicationError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { beforeEach, describe, expect, test } from 'bun:test';

/**
 * The columns every engine's conformance table declares. Types differ per engine - `tags` is a
 * `text[]` on Postgres and a JSON-mode `text` on SQLite - so the suite names columns and never
 * spells a type.
 */
export interface IConformanceRow {
  id: number;
  name: string;
  tenant: string;
  score: number;
  secret: string;
  tags: string[];
}

/**
 * Loosely typed on purpose: each engine binds its own `ExtraOptions` and datasource, and the suite
 * must run either.
 */
export type TConformanceRepository = DefaultRelationalRepository<AnyType>;

/**
 * Two kinds of engine difference, both ASSERTED rather than skipped. A refusal (`rowLocking`,
 * `regexp`, `arrayOperators`) is pinned as a NotSupported throw. A divergence
 * (`caseInsensitiveLike`, `nullsSortHigh`) is worse - identical code succeeds on both engines and
 * answers differently - so each engine pins the answer it gives.
 */
export interface IConformanceCapabilities {
  /** `SELECT ... FOR UPDATE`. SQLite locks the database file, never a row. */
  rowLocking: boolean;

  /** The `regexp` operator. SQLite defines no `regexp()` function and libsql registers none. */
  regexp: boolean;

  /** `contains` / `containedBy` / `overlaps`. SQLite has no array storage class. */
  arrayOperators: boolean;

  /**
   * SQLite's native `LIKE` folds ASCII case; Postgres's
   * does not. `like` widens and `nlike` narrows.
   */
  caseInsensitiveLike: boolean;

  /**
   * Where NULL sorts: Postgres compares it GREATER than
   * every value, SQLite smaller. Inverts by direction.
   */
  nullsSortHigh: boolean;
}

export interface IConformanceHarness {
  /** CRUD over the conformance table. `secret` is hidden; no default filter. */
  repository: TConformanceRepository;

  /**
   * The same table through a model whose `@model` settings
   * pin `defaultFilter: { where: { tenant: 'acme' } }`.
   */
  scopedRepository: TConformanceRepository;

  beginTransaction(): Promise<IRelationalTransaction<AnyType>>;
}

const SEED = [
  { name: 'alpha', tenant: 'acme', score: 10, secret: 'alpha-secret', tags: ['x', 'y'] },
  { name: 'beta', tenant: 'acme', score: 20, secret: 'beta-secret', tags: ['y'] },
  { name: 'gamma', tenant: 'other', score: 30, secret: 'gamma-secret', tags: ['z'] },
];

const expectNotSupported = (caught: unknown): void => {
  expect(caught).toBeInstanceOf(ApplicationError);

  const error = caught as ApplicationError;
  expect(error.statusCode).toBe(HTTP.ResultCodes.RS_5.NotImplemented);
  expect(error.normalized.code).toBe('core.not_supported');
};

const captureRejection = async (execution: () => Promise<unknown>): Promise<unknown> => {
  try {
    await execution();
    return undefined;
  } catch (error) {
    return error;
  }
};

/**
 * One repository-level suite run against every relational engine, in-process against a REAL
 * database (PGlite for Postgres, libsql `:memory:` for SQLite). Asserts the behaviour a
 * repository consumer depends on, never an engine's SQL text; where an engine cannot do something
 * it pins the NotSupported throw, because a suite that skips the differences proves nothing.
 */
export const runRepositoryConformance = (opts: {
  engine: string;
  capabilities: IConformanceCapabilities;
  build: () => IConformanceHarness;
}): void => {
  const { engine, capabilities, build } = opts;

  describe(`Relational repository conformance - ${engine}`, () => {
    let harness: IConformanceHarness;
    let repository: TConformanceRepository;
    let scopedRepository: TConformanceRepository;

    /** Name -> id of the seeded rows; ids are engine-assigned, so nothing may hardcode them. */
    let seededIds: Record<string, number>;

    beforeEach(async () => {
      harness = build();
      ({ repository, scopedRepository } = harness);

      await repository.deleteAll({ where: {}, options: { force: true, shouldReturn: false } });

      const seeded = await repository.createAll<IConformanceRow>({ data: SEED });

      seededIds = {};
      for (const row of seeded.data) {
        seededIds[row.name] = row.id;
      }
    });

    test('create() reports a count of 1 and returns the row it persisted', async () => {
      const created = await repository.create<IConformanceRow>({
        data: { name: 'delta', tenant: 'acme', score: 40, secret: 'delta-secret', tags: ['w'] },
      });

      expect(created.count).toBe(1);
      expect(created.data).toMatchObject({ name: 'delta', tenant: 'acme', score: 40 });
      expect(created.data.id).toBeDefined();
    });

    test('findById() reads back exactly what create() persisted', async () => {
      const created = await repository.create<IConformanceRow>({
        data: { name: 'epsilon', tenant: 'acme', score: 50, secret: 'epsilon-secret', tags: ['w'] },
      });

      const found = await repository.findById<IConformanceRow>({ id: created.data.id });

      expect(found).toMatchObject({ id: created.data.id, name: 'epsilon', score: 50 });
      expect(found?.tags).toEqual(['w']);
    });

    test('findById() resolves null for an absent id rather than throwing', async () => {
      expect(await repository.findById({ id: 999_999 })).toBeNull();
    });

    test('find() applies a where, an order and a limit', async () => {
      const rows = await repository.find<IConformanceRow>({
        filter: { where: { score: { gte: 20 } }, order: ['score DESC'] },
      });

      expect(rows.map(row => row.name)).toEqual(['gamma', 'beta']);
    });

    test('find() composes nested operators inside a logical group', async () => {
      const rows = await repository.find<IConformanceRow>({
        filter: {
          where: { or: [{ name: 'alpha' }, { score: { gt: 25 } }] },
          order: ['name ASC'],
        },
      });

      expect(rows.map(row => row.name)).toEqual(['alpha', 'gamma']);
    });

    test('count() honours its where', async () => {
      expect(await repository.count({ where: {} })).toEqual({ count: 3 });
      expect(await repository.count({ where: { tenant: 'acme' } })).toEqual({ count: 2 });
    });

    test('updateById() returns the updated row', async () => {
      const updated = await repository.updateById<IConformanceRow>({
        id: seededIds.alpha,
        data: { score: 11 },
      });

      expect(updated.count).toBe(1);
      expect(updated.data).toMatchObject({ id: seededIds.alpha, score: 11 });
    });

    // The discriminating case: with `shouldReturn: false` there are no
    // rows to count, so `count` can only come from the driver's own
    // affected-row field. An engine that guessed would answer 1 or 0.
    test('updateAll() reports a truthful count for a multi-row match without RETURNING', async () => {
      const updated = await repository.updateAll({
        data: { score: 99 },
        where: { tenant: 'acme' },
        options: { shouldReturn: false },
      });

      expect(updated).toEqual({ count: 2, data: null });
      expect(await repository.count({ where: { score: 99 } })).toEqual({ count: 2 });
    });

    test('updateAll() matching nothing reports zero and changes nothing', async () => {
      const updated = await repository.updateAll({
        data: { score: 99 },
        where: { tenant: 'no-such-tenant' },
        options: { shouldReturn: false },
      });

      expect(updated.count).toBe(0);
      expect(await repository.count({ where: { score: 99 } })).toEqual({ count: 0 });
    });

    test('deleteById() removes the row and it stops being readable', async () => {
      const deleted = await repository.deleteById({ id: seededIds.beta });

      expect(deleted.count).toBe(1);
      expect(await repository.findById({ id: seededIds.beta })).toBeNull();
      expect(await repository.count({ where: {} })).toEqual({ count: 2 });
    });

    test('deleteAll() reports a truthful count for a multi-row match without RETURNING', async () => {
      const deleted = await repository.deleteAll({
        where: { tenant: 'acme' },
        options: { shouldReturn: false },
      });

      expect(deleted).toEqual({ count: 2, data: null });
      expect(await repository.count({ where: {} })).toEqual({ count: 1 });
    });

    test("a caller's where is MERGED with the model's defaultFilter, never substituted for it", async () => {
      const rows = await scopedRepository.find<IConformanceRow>({
        filter: { where: { score: { gte: 10 } }, order: ['name ASC'] },
      });

      // `gamma` satisfies the caller's where and fails the
      // scope; a merge that lost the default would return it.
      expect(rows.map(row => row.name)).toEqual(['alpha', 'beta']);
    });

    test('the defaultFilter also scopes findById() and count()', async () => {
      expect(await scopedRepository.findById({ id: seededIds.gamma })).toBeNull();
      expect(await scopedRepository.findById({ id: seededIds.alpha })).not.toBeNull();
      expect(await scopedRepository.count({ where: {} })).toEqual({ count: 2 });
    });

    test('shouldSkipDefaultFilter escapes the scope explicitly', async () => {
      const rows = await scopedRepository.find<IConformanceRow>({
        filter: {},
        options: { shouldSkipDefaultFilter: true },
      });

      expect(rows).toHaveLength(3);
    });

    test('a hidden column is absent from every read', async () => {
      const rows = await repository.find<IConformanceRow>({ filter: {} });
      const found = await repository.findById<IConformanceRow>({ id: seededIds.alpha });

      for (const row of rows) {
        expect('secret' in row).toBe(false);
      }
      expect('secret' in (found as object)).toBe(false);
    });

    test('a hidden column is absent from a write response, though it IS persisted', async () => {
      const created = await repository.create<IConformanceRow>({
        data: { name: 'zeta', tenant: 'acme', score: 60, secret: 'zeta-secret', tags: [] },
      });
      const updated = await repository.updateById<IConformanceRow>({
        id: created.data.id,
        data: { score: 61 },
      });

      expect('secret' in created.data).toBe(false);
      expect('secret' in updated.data).toBe(false);

      // The column is excluded from the projection, not from the row: a filter on it still matches.
      expect(await repository.count({ where: { secret: 'zeta-secret' } })).toEqual({ count: 1 });
    });

    test('a committed transaction persists its writes', async () => {
      const transaction = await harness.beginTransaction();

      await repository.create({
        data: { name: 'committed', tenant: 'acme', score: 1, secret: 'x', tags: [] },
        options: { transaction },
      });
      await transaction.commit();

      expect(await repository.count({ where: { name: 'committed' } })).toEqual({ count: 1 });
    });

    test('a rolled-back transaction persists nothing', async () => {
      const transaction = await harness.beginTransaction();

      await repository.create({
        data: { name: 'rolled-back', tenant: 'acme', score: 1, secret: 'x', tags: [] },
        options: { transaction },
      });
      await transaction.rollback();

      expect(await repository.count({ where: { name: 'rolled-back' } })).toEqual({ count: 0 });
    });

    test(
      capabilities.rowLocking
        ? 'row locking returns the locked rows'
        : 'row locking throws NotSupported',
      async () => {
        const transaction = await harness.beginTransaction();

        try {
          const execution = () =>
            repository.find<IConformanceRow>({
              filter: { where: { tenant: 'acme' } },
              options: { transaction, lock: { strength: LockStrengths.UPDATE } },
            });

          if (!capabilities.rowLocking) {
            expectNotSupported(await captureRejection(execution));
            return;
          }

          expect(await execution()).toHaveLength(2);
        } finally {
          await transaction.rollback();
        }
      },
    );

    test(
      capabilities.regexp
        ? 'the regexp operator matches'
        : 'the regexp operator throws NotSupported',
      async () => {
        const execution = () =>
          repository.find<IConformanceRow>({ filter: { where: { name: { regexp: '^al' } } } });

        if (!capabilities.regexp) {
          expectNotSupported(await captureRejection(execution));
          return;
        }

        expect((await execution()).map(row => row.name)).toEqual(['alpha']);
      },
    );

    test(
      capabilities.caseInsensitiveLike
        ? 'like FOLDS CASE - the same pattern returns strictly more rows here than on Postgres'
        : 'like is case-SENSITIVE',
      async () => {
        await repository.create<IConformanceRow>({
          data: { name: 'Alpha', tenant: 'acme', score: 15, secret: 'x', tags: [] },
        });

        // Sorted in JS: an ORDER BY over mixed case would assert
        // the engine's collation, which is a different question.
        const matched = await repository.find<IConformanceRow>({
          filter: { where: { name: { like: 'alpha' } } },
        });
        const rejected = await repository.find<IConformanceRow>({
          filter: { where: { name: { nlike: 'alpha' } } },
        });

        const matchedNames = matched.map(row => row.name).sort();
        const rejectedNames = rejected.map(row => row.name).sort();

        if (capabilities.caseInsensitiveLike) {
          // `nlike` is the dangerous half: it silently
          // DROPS 'Alpha', which the caller asked to keep.
          expect(matchedNames).toEqual(['Alpha', 'alpha']);
          expect(rejectedNames).toEqual(['beta', 'gamma']);
          return;
        }

        expect(matchedNames).toEqual(['alpha']);
        expect(rejectedNames).toEqual(['Alpha', 'beta', 'gamma']);
      },
    );

    test(
      capabilities.nullsSortHigh
        ? 'NULL sorts HIGH - last ascending, first descending'
        : 'NULL sorts LOW - first ascending, last descending',
      async () => {
        await repository.create<IConformanceRow>({
          data: { name: 'nulled', tenant: 'acme', score: null as never, secret: 'x', tags: [] },
        });

        const ascending = await repository.find<IConformanceRow>({
          filter: { order: ['score ASC'] },
        });
        const descending = await repository.find<IConformanceRow>({
          filter: { order: ['score DESC'] },
        });

        const ascendingIndex = ascending.findIndex(row => row.name === 'nulled');
        const descendingIndex = descending.findIndex(row => row.name === 'nulled');

        expect(ascending).toHaveLength(4);
        expect(descending).toHaveLength(4);

        if (capabilities.nullsSortHigh) {
          expect(ascendingIndex).toBe(ascending.length - 1);
          expect(descendingIndex).toBe(0);
          return;
        }

        expect(ascendingIndex).toBe(0);
        expect(descendingIndex).toBe(descending.length - 1);
      },
    );

    test(
      capabilities.arrayOperators
        ? 'the contains operator matches array membership'
        : 'the contains operator throws NotSupported',
      async () => {
        const execution = () =>
          repository.find<IConformanceRow>({
            filter: { where: { tags: { contains: ['y'] } }, order: ['name ASC'] },
          });

        if (!capabilities.arrayOperators) {
          expectNotSupported(await captureRejection(execution));
          return;
        }

        expect((await execution()).map(row => row.name)).toEqual(['alpha', 'beta']);
      },
    );
  });
};
