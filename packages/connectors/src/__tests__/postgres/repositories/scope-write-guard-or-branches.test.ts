import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { model, RepositoryErrorCodes, ScopeFilters } from '@venizia/ignis-kernel';
import { BaseRelationalEntity, UniqueKeys } from '@/relational/core/models';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/relational/postgres/repositories/executor';

/**
 * A scope that is an `or` over different columns, against a real PGlite: a row belongs to a merchant
 * of mine, or to no merchant and to an organizer of mine. Each written row is held to one branch.
 */
const TABLE_NAME = 'write_guard_or_items';

const itemsTable = pgTable(
  TABLE_NAME,
  {
    id: serial('id').primaryKey(),
    merchantId: text('merchant_id'),
    organizerId: text('organizer_id'),
    code: text('code'),
    name: text('name'),
  },
  (table) => [uniqueIndex('write_guard_or_items_code').on(table.code)],
);

const codeKey = UniqueKeys.of({ table: itemsTable, index: 'write_guard_or_items_code' });

const TWO_LEVEL = {
  or: [
    { merchantId: { inq: ['m-a', 'm-b'] } },
    { merchantId: null, organizerId: { inq: ['o-a'] } },
  ],
};

let scope: AnyType = TWO_LEVEL;
const resolve = () => scope;

@model({ type: 'entity', settings: { access: { resolve } } })
class RejectItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = TABLE_NAME;
}

@model({ type: 'entity', settings: { access: { resolve, write: { sharedRows: true } } } })
class SharedItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = TABLE_NAME;
}

@model({ type: 'entity', settings: { access: { resolve, write: { mode: 'assign' } } } })
class AssignItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = TABLE_NAME;
}

const refusal = async (task: Promise<unknown>) => {
  try {
    await task;
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the write to be refused');
};

/** `count` branches over two columns, none of which merge: `{ merchantId: m-i, organizerId: o-i }`. */
const branches = (count: number) => ({
  or: Array.from({ length: count }, (_, index) => ({
    merchantId: `m-${index}`,
    organizerId: `o-${index}`,
  })),
});

describe('scopeFilter write guard - an or over different columns', () => {
  const client = new PGlite();
  let driver: PGliteDriver<AnyType>;

  const build = (entityClass: AnyType) => {
    const dataSource: AnyType = {
      getQueryDialect: () => new PostgresQueryDialect(),
      getQueryExecutor: () => new PostgresQueryExecutor(),
      getConnector: () => driver.createConnector({ schema: { itemsTable } }),
    };
    const repositoryClass: AnyType = DefaultCRUDRepository;

    return new repositoryClass(dataSource, { entityClass });
  };

  const rows = async () => {
    const result = await client.query<{
      merchantId: string | null;
      organizerId: string | null;
      name: string;
    }>(
      `SELECT merchant_id AS "merchantId", organizer_id AS "organizerId", name FROM ${TABLE_NAME} ORDER BY id`,
    );

    return result.rows;
  };

  /** One row per level, written past the scope: a merchant row (id 1) and an organizer row (id 2). */
  const seed = async () => {
    scope = ScopeFilters.UNRESTRICTED;
    const repository = build(RejectItem);
    await repository.create({ data: { merchantId: 'm-a', organizerId: 'o-a', name: 'merchant' } });
    await repository.create({ data: { merchantId: null, organizerId: 'o-a', name: 'organizer' } });
    scope = TWO_LEVEL;
  };

  beforeAll(async () => {
    await client.waitReady;
    driver = new PGliteDriver<AnyType>({ client });
    await client.exec(
      `CREATE TABLE ${TABLE_NAME} (id serial primary key, merchant_id text, organizer_id text, code text, name text)`,
    );
    await client.exec(`CREATE UNIQUE INDEX write_guard_or_items_code ON ${TABLE_NAME} (code)`);
  }, 30_000);

  beforeEach(async () => {
    scope = TWO_LEVEL;
    await client.exec(`TRUNCATE ${TABLE_NAME} RESTART IDENTITY`);
  });

  afterAll(async () => {
    await driver.end();
  });

  describe('create', () => {
    test('a merchant row passes through the first branch, whatever its organizer', async () => {
      await build(RejectItem).create({
        data: { merchantId: 'm-a', organizerId: 'o-other', name: 'mixed' },
      });
      await build(RejectItem).create({ data: { merchantId: 'm-b', name: 'no-organizer' } });

      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['mixed', 'no-organizer']);
    });

    test('an organizer row passes through the second branch, and only with sharedRows', async () => {
      const denied = await refusal(
        build(RejectItem).create({
          data: { merchantId: null, organizerId: 'o-a', name: 'organizer' },
        }),
      );
      await build(SharedItem).create({
        data: { merchantId: null, organizerId: 'o-a', name: 'organizer' },
      });
      await build(SharedItem).create({ data: { organizerId: 'o-a', name: 'absent-merchant' } });

      expect(denied.statusCode).toBe(403);
      const result = await rows();
      expect(result).toEqual([
        { merchantId: null, organizerId: 'o-a', name: 'organizer' },
        { merchantId: null, organizerId: 'o-a', name: 'absent-merchant' },
      ]);
    });

    test('a row in neither branch is refused with 403 and the code, naming no value', async () => {
      const error = await refusal(
        build(SharedItem).create({
          data: { merchantId: 'm-secret', organizerId: 'o-secret', name: 'x' },
        }),
      );

      expect(error.statusCode).toBe(403);
      expect(error.normalized.code).toBe(RepositoryErrorCodes.SCOPE_WRITE_DENIED);
      expect(error.message).toContain('the row satisfies no branch of the resolved scope');
      expect(error.message).not.toContain('m-secret');
      expect(error.message).not.toContain('o-secret');
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('a foreign merchant is refused even when the organizer alone would pass', async () => {
      await refusal(
        build(RejectItem).create({
          data: { merchantId: 'm-other', organizerId: 'o-a', name: 'x' },
        }),
      );
      await refusal(
        build(SharedItem).create({
          data: { merchantId: 'm-other', organizerId: 'o-a', name: 'x' },
        }),
      );

      const result = await rows();
      expect(result).toEqual([]);
    });

    test('sharedRows admits null only where a branch allows it: not on a foreign organizer', async () => {
      await refusal(
        build(SharedItem).create({ data: { merchantId: null, organizerId: 'o-other', name: 'x' } }),
      );
      await refusal(build(SharedItem).create({ data: { organizerId: 'o-other', name: 'x' } }));
      await refusal(build(SharedItem).create({ data: { name: 'x' } }));

      const result = await rows();
      expect(result).toEqual([]);
    });

    test('createAll refuses the whole batch when one row satisfies no branch', async () => {
      await refusal(
        build(RejectItem).createAll({
          data: [
            { merchantId: 'm-a', name: 'ok' },
            { merchantId: 'm-other', organizerId: 'o-a', name: 'bad' },
          ],
        }),
      );

      const result = await rows();
      expect(result).toEqual([]);
    });
  });

  describe('upsert, the insert path', () => {
    test('a new row is held to the branches like a create', async () => {
      await build(RejectItem).upsert({
        data: { code: 'c-1', merchantId: 'm-a', organizerId: 'o-other', name: 'merchant' },
        on: codeKey,
      });
      await build(SharedItem).upsert({
        data: { code: 'c-2', merchantId: null, organizerId: 'o-a', name: 'organizer' },
        on: codeKey,
      });
      await refusal(
        build(RejectItem).upsert({
          data: { code: 'c-3', merchantId: null, organizerId: 'o-a', name: 'no-shared' },
          on: codeKey,
        }),
      );
      await refusal(
        build(SharedItem).upsert({
          data: { code: 'c-4', merchantId: 'm-other', organizerId: 'o-a', name: 'foreign' },
          on: codeKey,
        }),
      );

      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['merchant', 'organizer']);
    });
  });

  describe('update', () => {
    test('a payload that writes a scope column without a whole branch is refused', async () => {
      await seed();

      const error = await refusal(
        build(RejectItem).updateById({ id: 1, data: { organizerId: 'o-a' } }),
      );

      expect(error.statusCode).toBe(403);
      expect(error.normalized.code).toBe(RepositoryErrorCodes.SCOPE_WRITE_DENIED);
      const result = await rows();
      expect(result.map((row) => row.organizerId)).toEqual(['o-a', 'o-a']);
    });

    test('a payload that satisfies a whole branch is written', async () => {
      await seed();

      await build(RejectItem).updateById({ id: 1, data: { merchantId: 'm-b' } });
      await build(SharedItem).updateById({ id: 1, data: { merchantId: null, organizerId: 'o-a' } });

      const result = await rows();
      expect(result[0]).toEqual({ merchantId: null, organizerId: 'o-a', name: 'merchant' });
    });

    test('a payload that writes no scope column is not checked', async () => {
      await seed();

      const updated = await build(RejectItem).updateById({ id: 1, data: { name: 'renamed' } });

      expect(updated.count).toBe(1);
      const result = await rows();
      expect(result[0].name).toBe('renamed');
    });

    test('a stored organizer row cannot be moved out by writing its organizer alone', async () => {
      await seed();
      const repository = build(SharedItem);

      await refusal(repository.updateById({ id: 2, data: { organizerId: 'o-other' } }));
      await refusal(
        repository.updateBy({ where: { name: 'organizer' }, data: { organizerId: 'o-other' } }),
      );
      await refusal(repository.updateById({ id: 2, data: { merchantId: 'm-other' } }));

      const result = await rows();
      expect(result[1]).toEqual({ merchantId: null, organizerId: 'o-a', name: 'organizer' });
    });

    test('a stored organizer row can be moved to a merchant of mine', async () => {
      await seed();

      await build(SharedItem).updateById({ id: 2, data: { merchantId: 'm-a' } });

      const result = await rows();
      expect(result[1]).toEqual({ merchantId: 'm-a', organizerId: 'o-a', name: 'organizer' });
    });

    test('without sharedRows the organizer row is not reachable for an update or a delete', async () => {
      await seed();
      const repository = build(RejectItem);

      const updated = await repository.updateById({ id: 2, data: { name: 'x' } });
      const deleted = await repository.deleteAll({ where: {}, options: { force: true } });

      expect(updated.count).toBe(0);
      expect(deleted.count).toBe(1);
      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['organizer']);
    });

    test('a scope whose every branch needs sharedRows matches no row without it', async () => {
      await seed();
      scope = {
        or: [
          { merchantId: null, organizerId: 'o-a' },
          { merchantId: null, name: 'merchant' },
        ],
      };

      const deleted = await build(RejectItem).deleteAll({ where: {}, options: { force: true } });
      const shared = await build(SharedItem).deleteById({ id: 2 });

      expect(deleted.count).toBe(0);
      expect(shared.count).toBe(1);
    });
  });

  describe('a branch whose list comes back empty', () => {
    const NO_ORGANIZER = {
      or: [{ merchantId: { inq: ['m-a'] } }, { merchantId: null, organizerId: { inq: [] } }],
    };
    const NO_MERCHANT = {
      or: [{ merchantId: { inq: [] } }, { merchantId: null, organizerId: { inq: ['o-a'] } }],
    };

    test('a merchant user with no organizer cannot write into an organizer of someone else', async () => {
      await seed();
      scope = NO_ORGANIZER;
      const repository = build(SharedItem);

      await refusal(
        repository.create({ data: { merchantId: null, organizerId: 'o-victim', name: 'x' } }),
      );
      await refusal(repository.updateById({ id: 1, data: { merchantId: null } }));

      const result = await rows();
      expect(result).toEqual([
        { merchantId: 'm-a', organizerId: 'o-a', name: 'merchant' },
        { merchantId: null, organizerId: 'o-a', name: 'organizer' },
      ]);
    });

    test('an organizer user with no merchant cannot write a row that belongs to nobody', async () => {
      await seed();
      scope = NO_MERCHANT;
      const repository = build(SharedItem);

      await refusal(
        repository.create({ data: { merchantId: null, organizerId: null, name: 'x' } }),
      );
      await refusal(repository.updateById({ id: 2, data: { organizerId: null } }));
      await repository.updateById({
        id: 2,
        data: { merchantId: null, organizerId: 'o-a', name: 'kept' },
      });

      const result = await rows();
      expect(result[1]).toEqual({ merchantId: null, organizerId: 'o-a', name: 'kept' });
      expect(result).toHaveLength(2);
    });
  });

  describe('a scope of one branch over several columns', () => {
    test('an update checks only the scope column it writes', async () => {
      await seed();
      scope = { merchantId: 'm-a', organizerId: 'o-a' };
      const repository = build(RejectItem);

      await repository.updateById({ id: 1, data: { organizerId: 'o-a', name: 'kept' } });
      const error = await refusal(
        repository.updateById({ id: 1, data: { organizerId: 'o-other' } }),
      );

      expect(error.message).toContain('column: organizerId');
      expect(error.message).toContain('the value is outside the resolved scope');
      const result = await rows();
      expect(result[0]).toEqual({ merchantId: 'm-a', organizerId: 'o-a', name: 'kept' });
    });
  });

  describe('assign', () => {
    const PAIRS = {
      or: [
        { merchantId: 'm-a', organizerId: 'o-a' },
        { merchantId: 'm-b', organizerId: 'o-b' },
      ],
    };

    test('fills the columns of the one branch the row can still satisfy', async () => {
      scope = PAIRS;

      await build(AssignItem).create({ data: { merchantId: 'm-b', name: 'one' } });

      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-b', organizerId: 'o-b', name: 'one' }]);
    });

    test('fills nothing when two branches remain, so the row is refused', async () => {
      scope = PAIRS;

      const error = await refusal(build(AssignItem).create({ data: { name: 'one' } }));

      expect(error.message).toContain('the row satisfies no branch of the resolved scope');
      const result = await rows();
      expect(result).toEqual([]);
    });
  });

  describe('the branch cap', () => {
    test('32 branches are read', async () => {
      scope = branches(32);

      await build(RejectItem).create({
        data: { merchantId: 'm-31', organizerId: 'o-31', name: 'x' },
      });
      await refusal(
        build(RejectItem).create({ data: { merchantId: 'm-31', organizerId: 'o-0', name: 'y' } }),
      );

      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['x']);
    });

    test('33 branches cannot be verified, for a create and for a delete', async () => {
      await seed();
      scope = branches(33);

      const created = await refusal(
        build(RejectItem).create({ data: { merchantId: 'm-0', organizerId: 'o-0', name: 'x' } }),
      );
      const deleted = await refusal(build(RejectItem).deleteById({ id: 1 }));

      expect(created.message).toMatch(/cannot be verified.*more than 32 branches/);
      expect(deleted.message).toMatch(/cannot be verified.*more than 32 branches/);
      const result = await rows();
      expect(result).toHaveLength(2);
    });
  });

  describe('a branch the guard cannot read', () => {
    test.each([
      [
        'a range',
        { or: [{ merchantId: 'm-a' }, { merchantId: null, organizerId: { gt: 'o' } }] },
        /operator 'gt'/,
      ],
      [
        'a nested path',
        { or: [{ merchantId: 'm-a' }, { merchantId: null, 'meta.organizer': 'o-a' }] },
        /nested path/,
      ],
      [
        'two operators',
        {
          or: [{ merchantId: 'm-a' }, { merchantId: null, organizerId: { eq: 'o-a', neq: 'o-b' } }],
        },
        /2 operators/,
      ],
    ])('%s refuses a create and a delete', async (_label, resolved, pattern) => {
      await seed();
      scope = resolved;

      const created = await refusal(
        build(RejectItem).create({ data: { merchantId: 'm-a', name: 'x' } }),
      );
      const deleted = await refusal(build(RejectItem).deleteById({ id: 1 }));

      expect(created.message).toMatch(/cannot be verified/);
      expect(created.message).toMatch(pattern);
      expect(deleted.message).toMatch(pattern);
      const result = await rows();
      expect(result).toHaveLength(2);
    });
  });
});
