import { describe, expect, test } from 'bun:test';
import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { model } from '@venizia/ignis-kernel';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/relational/postgres/repositories/executor';
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

@model({ type: 'entity', settings: { hiddenProperties: ['secret'] } })
class SecretAccountEntity extends BaseRelationalEntity<typeof secretAccounts> {
  static override schema = secretAccounts;
  static override TABLE_NAME = 'data_safety_secret_accounts';
}

/** Records which top-level verb was reached and the payloads handed to `set()` / `select()` / `returning()`. */
const buildRecordingConnector = () => {
  const trail: string[] = [];
  const captured: {
    setPayload?: Record<string, AnyType>;
    selectProjection?: AnyType;
    returningProjection?: AnyType;
  } = {};

  const chain: Record<string, AnyType> = {};
  chain.from = () => chain;
  chain.$dynamic = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = () => chain;
  chain.offset = () => chain;
  chain.values = () => chain;
  chain.set = (payload: Record<string, AnyType>) => {
    captured.setPayload = payload;
    return chain;
  };
  chain.returning = (projection?: AnyType) => {
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
      select: (projection?: AnyType) => {
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
    } as AnyType,
  };
};

const buildDataSource = (connector: AnyType): AnyType => ({
  getQueryDialect: () => new PostgresQueryDialect(),
  getQueryExecutor: () => new PostgresQueryExecutor(),
  getConnector: () => connector,
});

describe('SoftDeletableRelationalRepository.deleteById - never reaches DELETE', () => {
  test('emits an UPDATE stamping deletedAt and no DELETE at all', async () => {
    const { connector, trail, captured } = buildRecordingConnector();
    const repository = new SoftDeletableRelationalRepository<AnyType>(buildDataSource(connector), {
      entityClass: SoftAccountEntity,
    });

    await repository.deleteById({ id: 1 });

    expect(trail).toEqual(['update']);
    expect(trail).not.toContain('delete');

    const setPayload = captured.setPayload as Record<string, AnyType>;
    expect(Object.keys(setPayload)).toEqual(['deletedAt']);
    expect(setPayload.deletedAt).toBeInstanceOf(Date);
  });
});

describe('hidden properties never reach the wire', () => {
  test('a read projects only the visible columns', async () => {
    const { connector, captured } = buildRecordingConnector();
    const repository = new ReadableRelationalRepository<AnyType>(buildDataSource(connector), {
      entityClass: SecretAccountEntity,
    });

    await repository.find({ filter: {} });

    const projection = captured.selectProjection as Record<string, AnyType>;
    expect(projection).toBeDefined();
    expect(Object.keys(projection).sort()).toEqual(['email', 'id']);
    expect(projection).not.toHaveProperty('secret');
  });

  test("a write's returning projection omits the same hidden property", async () => {
    const { connector, captured } = buildRecordingConnector();
    const repository = new PersistableRelationalRepository<AnyType>(buildDataSource(connector), {
      entityClass: SecretAccountEntity,
    });

    await repository.create({ data: { email: 'a@b.c', secret: 'hunter2' } as AnyType });

    const projection = captured.returningProjection as Record<string, AnyType>;
    expect(projection).toBeDefined();
    expect(Object.keys(projection).sort()).toEqual(['email', 'id']);
    expect(projection).not.toHaveProperty('secret');
  });
});
