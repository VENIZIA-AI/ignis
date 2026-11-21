import { describe, expect, test } from 'bun:test';
import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { model } from '@venizia/ignis-kernel';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { StubDataSource } from './fixtures/stub-datasource.fixture';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { BaseRelationalEntity } from '@/relational/core/models';
import { PersistableRelationalRepository } from '@/relational/core/repositories/core/persistable';
import { ReadableRelationalRepository } from '@/relational/core/repositories/core/readable';
import { SoftDeletableRelationalRepository } from '@/relational/core/repositories/core/soft-deletable';

/**
 * Two behaviours that fail in a direction that destroys or leaks data, and that nothing else
 * observes: soft delete must never let `deleteById` remove rows permanently, and hidden-column
 * exclusion must hold on read AND on write.
 */

const softAccounts = pgTable('data_safety_soft_accounts', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }),
  deletedAt: timestamp('deleted_at'),
});

const secretAccounts = pgTable('data_safety_secret_accounts', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }),
  // Property and column names diverge: the projection is keyed by the SCHEMA PROPERTY, so a
  // column-keyed exclusion would silently let the hidden value through.
  secret: varchar('secret_hash', { length: 255 }),
});

@model({ type: 'entity' })
class SoftAccountEntity extends BaseRelationalEntity<typeof softAccounts> {
  static override schema = softAccounts;
  static override TABLE_NAME = 'data_safety_soft_accounts';
}

@model({ type: 'entity', settings: { properties: { hidden: ['secret'] } } })
class SecretAccountEntity extends BaseRelationalEntity<typeof secretAccounts> {
  static override schema = secretAccounts;
  static override TABLE_NAME = 'data_safety_secret_accounts';
}

/** Records which top-level verb was reached and the payloads handed to `set()` / `select()` / `returning()`. */
const buildRecordingConnector = () => {
  const trail: string[] = [];
  const captured: {
    setPayload?: Record<string, unknown>;
    selectProjection?: Record<string, unknown>;
    returningProjection?: Record<string, unknown>;
  } = {};

  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.$dynamic = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = () => chain;
  chain.offset = () => chain;
  chain.values = () => chain;

  chain.set = (payload: Record<string, unknown>) => {
    captured.setPayload = payload;

    return chain;
  };

  chain.returning = (projection?: Record<string, unknown>) => {
    captured.returningProjection = projection;

    return Promise.resolve([]);
  };

  // Every non-`returning()` terminal resolves to an empty row set; no test here takes the
  // `shouldReturn: false` branch that would read a driver result instead.
  chain.then = (resolve: (value: unknown) => void) => resolve([]);

  return {
    trail,
    captured,
    connector: {
      select: (projection?: Record<string, unknown>) => {
        trail.push('select');
        captured.selectProjection = projection;

        return chain;
      },
      insert: () => {
        trail.push('insert');

        return chain;
      },
      update: () => {
        trail.push('update');

        return chain;
      },
      delete: () => {
        trail.push('delete');

        return chain;
      },
      $count: async () => 0,
    },
  };
};

const buildDataSource = (connector: unknown) => new StubDataSource({ connector });

const defined = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Expected ${label} to be captured`);
  }

  return value;
};

describe('SoftDeletableRelationalRepository.deleteById - never reaches DELETE', () => {
  test('emits an UPDATE stamping deletedAt and no DELETE at all', async () => {
    const { connector, trail, captured } = buildRecordingConnector();
    const repository = new SoftDeletableRelationalRepository<typeof softAccounts>(
      buildDataSource(connector),
      {
        entityClass: SoftAccountEntity,
      },
    );

    await repository.deleteById({ id: 1 });

    expect(trail).toEqual(['update']);
    expect(trail).not.toContain('delete');

    const setPayload = defined(captured.setPayload, 'the set payload');
    expect(Object.keys(setPayload)).toEqual(['deletedAt']);
    expect(setPayload.deletedAt).toBeInstanceOf(Date);
  });
});

/** A request body as the HTTP layer parses it: `JSON.parse` makes `__proto__` an OWN key, not a prototype. */
const proto = JSON.parse('{"email":"x","__proto__":{"id":999,"deletedAt":"2020-01-01"}}');

describe('a "__proto__" key in a write body is a plain key, never a prototype', () => {
  test('a soft delete refuses it as an unknown column and writes nothing', async () => {
    const { connector, trail } = buildRecordingConnector();
    const repository = new SoftDeletableRelationalRepository<typeof softAccounts>(
      buildDataSource(connector),
      {
        entityClass: SoftAccountEntity,
      },
    );

    await RejectionUtility.expectRejection({
      task: repository.deleteById({ id: 1, data: proto }),
      message: /Column NOT FOUND \| key: '__proto__'/,
    });
    expect(trail).not.toContain('update');
  });

  test('a plain update refuses it as an unknown column and writes nothing', async () => {
    const { connector, trail } = buildRecordingConnector();
    const repository = new PersistableRelationalRepository<typeof softAccounts>(
      buildDataSource(connector),
      {
        entityClass: SoftAccountEntity,
      },
    );

    await RejectionUtility.expectRejection({
      task: repository.updateById({ id: 1, data: proto }),
      message: /Column NOT FOUND \| key: '__proto__'/,
    });
    expect(trail).not.toContain('update');
  });

  test('the update transform reads own entries only: an inherited key never becomes a column', () => {
    const data = Object.create({ id: 999 });
    data.email = 'x';

    const transformed = new PostgresQueryDialect().transformUpdate({
      tableName: 'data_safety_soft_accounts',
      schema: softAccounts,
      data,
    });

    expect(transformed.regularFields).toEqual({ email: 'x' });
  });
});

describe('hidden properties never reach the wire', () => {
  test('a read projects only the visible columns', async () => {
    const { connector, captured } = buildRecordingConnector();
    const repository = new ReadableRelationalRepository<typeof secretAccounts>(
      buildDataSource(connector),
      {
        entityClass: SecretAccountEntity,
      },
    );

    await repository.find({ filter: {} });

    const projection = defined(captured.selectProjection, 'the select projection');
    expect(projection).toBeDefined();
    expect(Object.keys(projection).sort()).toEqual(['email', 'id']);
    expect(projection).not.toHaveProperty('secret');
  });

  test("a write's returning projection omits the same hidden property", async () => {
    const { connector, captured } = buildRecordingConnector();
    const repository = new PersistableRelationalRepository<typeof secretAccounts>(
      buildDataSource(connector),
      {
        entityClass: SecretAccountEntity,
      },
    );

    await repository.create({ data: { email: 'a@b.c', secret: 'hunter2' } });

    const projection = defined(captured.returningProjection, 'the returning projection');
    expect(projection).toBeDefined();
    expect(Object.keys(projection).sort()).toEqual(['email', 'id']);
    expect(projection).not.toHaveProperty('secret');
  });
});
