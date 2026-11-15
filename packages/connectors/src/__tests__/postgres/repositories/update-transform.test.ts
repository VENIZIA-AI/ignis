import { describe, expect, test } from 'bun:test';
import { SQL } from 'drizzle-orm';
import { DuckTypingUtility } from '@/common/internal';
import type { TRelationalConnector } from '@/relational/postgres/datasources/common';
import { jsonb, pgTable, PgDialect, serial, varchar } from 'drizzle-orm/pg-core';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { PersistableRepository } from '@/relational/postgres/repositories';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { UpdateBuilder } from '@/relational/postgres/repositories/dialect/update';
import { buildFakeConnector } from './fake-connector';
import { StubDataSource } from './stub-data-source';

/**
 * The update transform is the only engine-specific step between a caller's `data` and the driver's
 * `set()`. It composes raw `jsonb_set` SQL, so a silent failure here corrupts writes rather than
 * throwing. Everything below goes through the real `PostgresQueryDialect`, the object the
 * datasource actually hands repositories.
 */

const table = pgTable('update_transform_fixture', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  // Property and column names diverge on purpose: the transform keys `jsonExpressions` by the
  // SCHEMA PROPERTY (`metadata`) but quotes the DB COLUMN (`meta_data`) in the SQL it emits.
  metadata: jsonb('meta_data'),
});

const dialect = new PostgresQueryDialect();
const pgDialect = new PgDialect();

const transform = (data: Record<string, unknown>) =>
  dialect.transformUpdate({ tableName: 'update_transform_fixture', schema: table, data });

const compile = (expression: SQL): string => pgDialect.sqlToQuery(expression).sql;

describe('PostgresQueryDialect.transformUpdate - plain columns', () => {
  test('a plain column update passes through to regularFields untouched', () => {
    const transformed = transform({ name: 'updated' });

    expect(transformed.regularFields).toEqual({ name: 'updated' });
    expect(transformed.jsonExpressions).toEqual({});
  });

  test('an undefined value is dropped rather than written as NULL', () => {
    const transformed = transform({ name: undefined, id: 5 });

    expect(transformed.regularFields).toEqual({ id: 5 });
  });

  test('a plain key that is not a column throws', () => {
    expect(() => transform({ nope: 1 })).toThrow(
      "[UpdateBuilder][transform] Table: update_transform_fixture | Column NOT FOUND | key: 'nope'",
    );
  });
});

describe('PostgresQueryDialect.transformUpdate - JSON paths', () => {
  test('a JSON-path update produces a jsonExpressions entry keyed by the schema property', () => {
    const transformed = transform({ 'metadata.tier': 'gold' });

    expect(Object.keys(transformed.jsonExpressions)).toEqual(['metadata']);
    expect(transformed.regularFields).toEqual({});
  });

  test('the generated SQL is a jsonb_set over the DB column name, not the property name', () => {
    const transformed = transform({ 'metadata.tier': 'gold' });
    const sql = compile(transformed.jsonExpressions.metadata);

    expect(sql).toContain('jsonb_set');
    expect(sql).toBe(`jsonb_set("meta_data", '{"tier"}', '"gold"'::jsonb, true)`);
  });

  test('a plain column and a JSON path in one call split across the two buckets', () => {
    const transformed = transform({ name: 'updated', 'metadata.tier': 'gold' });

    expect(transformed.regularFields).toEqual({ name: 'updated' });
    expect(Object.keys(transformed.jsonExpressions)).toEqual(['metadata']);
  });

  test('null is written as a JSON null literal, not dropped', () => {
    const transformed = transform({ 'metadata.tier': null });

    expect(compile(transformed.jsonExpressions.metadata)).toBe(
      `jsonb_set("meta_data", '{"tier"}', 'null'::jsonb, true)`,
    );
  });
});

describe('PostgresQueryDialect.transformUpdate - two paths on one column', () => {
  /**
   * Grouping is what stops the second path from overwriting the first: both must end up inside ONE
   * nested expression, or one of the two updates is silently lost.
   */
  test('two JSON paths on the same column chain into a single nested jsonb_set', () => {
    const transformed = transform({ 'metadata.tier': 'gold', 'metadata.seats': 3 });

    expect(Object.keys(transformed.jsonExpressions)).toEqual(['metadata']);
    expect(compile(transformed.jsonExpressions.metadata)).toBe(
      `jsonb_set(jsonb_set("meta_data", '{"tier"}', '"gold"'::jsonb, true), '{"seats"}', '3'::jsonb, true)`,
    );
  });

  test('both values survive the chaining', () => {
    const sql = compile(
      transform({ 'metadata.tier': 'gold', 'metadata.seats': 3 }).jsonExpressions.metadata,
    );

    expect(sql).toContain(`'"gold"'::jsonb`);
    expect(sql).toContain(`'3'::jsonb`);
    expect(sql.match(/jsonb_set/g)).toHaveLength(2);
  });
});

describe('PostgresQueryDialect.transformUpdate - rejections', () => {
  test('a JSON path on a non-JSON column throws, naming the column and its dataType', () => {
    expect(() => transform({ 'name.tier': 'gold' })).toThrow(
      "[UpdateBuilder.transform] Table: update_transform_fixture | Column 'name' is not a JSON column | dataType: 'string'",
    );
  });

  test('an invalid JSON path component throws rather than reaching sql.raw', () => {
    expect(() => transform({ 'metadata.bad!': 1 })).toThrow(
      "[UpdateBuilder.transform] Table: update_transform_fixture | Invalid JSON path component: 'bad!'",
    );
  });
});

describe('PostgresQueryDialect.toUpdateData', () => {
  test('merges regularFields and jsonExpressions into the single object handed to set()', () => {
    const transformed = transform({ name: 'updated', 'metadata.tier': 'gold' });
    const updateData = dialect.toUpdateData({ transformed });

    expect(Object.keys(updateData).sort()).toEqual(['metadata', 'name']);
    expect(updateData.name).toBe('updated');

    const { metadata } = updateData;

    if (!(metadata instanceof SQL)) {
      throw new Error('toUpdateData did not return a SQL expression for metadata');
    }

    expect(compile(metadata)).toContain('jsonb_set');
  });

  test('an empty transform yields an empty set() payload', () => {
    expect(
      dialect.toUpdateData({ transformed: { regularFields: {}, jsonExpressions: {} } }),
    ).toEqual({});
  });
});

/** A structural read off the dialect, so the neutral tier keeps zero Postgres value imports. */
describe('PersistableRepository.updateBuilder (compatibility accessor)', () => {
  class UpdateAccessorFixtureEntity extends BasePostgresEntity {
    static override schema = table;
    static override TABLE_NAME = 'update_transform_fixture';
  }

  test('returns the very object the dialect exposes', () => {
    const repositoryDialect = new PostgresQueryDialect();
    const dataSource = new StubDataSource({
      connector: () => buildFakeConnector({ result: { rows: [], rowCount: 0 } }),
      dialect: repositoryDialect,
    });

    const repository = new PersistableRepository(dataSource, {
      entityClass: UpdateAccessorFixtureEntity,
    });

    expect(repository.updateBuilder).toBe(repositoryDialect.updateBuilder);
    expect(repository.updateBuilder).toBeInstanceOf(UpdateBuilder);
  });

  test('is undefined for a dialect that exposes no update builder', () => {
    const bareDialect = new PostgresQueryDialect();
    Object.defineProperty(bareDialect, 'updateBuilder', { get: () => undefined });
    const dataSource = new StubDataSource({ dialect: bareDialect });
    const repository = new PersistableRepository(dataSource, {
      entityClass: UpdateAccessorFixtureEntity,
    });

    expect(repository.updateBuilder).toBeUndefined();
  });
});

/**
 * The last hop: `_update` builds `updateData` and hands it to the executor, which hands it to
 * `.set()`. The shared `fake-connector` discards its `set()` argument, so nothing else in the suite
 * would notice a repository that dropped the payload entirely.
 */
/** The one verb the recording fake carries, stated as a guard so it can be handed over as a connector. */
const isUpdateConnector = (value: unknown): value is TRelationalConnector =>
  DuckTypingUtility.hasMembers({ value, members: { update: 'function' } });

describe('PersistableRepository.updateBy - the transform result reaches set()', () => {
  class UpdatePayloadFixtureEntity extends BasePostgresEntity {
    static override schema = table;
    static override TABLE_NAME = 'update_transform_fixture';
  }

  /** Like `buildFakeConnector`, but records what `set()` receives instead of throwing it away. */
  const buildRecordingConnector = () => {
    const captured: { setArgument?: Record<string, unknown> } = {};

    const connector = {
      update: () => ({
        set: (data: Record<string, unknown>) => {
          captured.setArgument = data;

          return { where: () => Promise.resolve({ rows: [], rowCount: 1 }) };
        },
      }),
    };

    if (!isUpdateConnector(connector)) {
      throw new Error('[buildRecordingConnector] The fake lacks update()');
    }

    return { captured, connector };
  };

  test('set() receives both the plain field and the JSON expression, not an empty object', async () => {
    const { captured, connector } = buildRecordingConnector();
    const dataSource = new StubDataSource({ connector: () => connector });

    const repository = new PersistableRepository(dataSource, {
      entityClass: UpdatePayloadFixtureEntity,
    });

    await repository.updateBy({
      data: { name: 'updated', 'metadata.tier': 'gold' },
      where: { id: 1 },
      options: { shouldReturn: false },
    });

    const { setArgument } = captured;

    expect(setArgument).toBeDefined();

    if (!setArgument) {
      throw new Error('set() was never called');
    }

    const { metadata } = setArgument;

    expect(Object.keys(setArgument).sort()).toEqual(['metadata', 'name']);
    expect(setArgument.name).toBe('updated');
    expect(metadata).toBeInstanceOf(SQL);

    if (!(metadata instanceof SQL)) {
      throw new Error('set() did not receive a SQL expression for metadata');
    }

    expect(compile(metadata)).toBe(`jsonb_set("meta_data", '{"tier"}', '"gold"'::jsonb, true)`);
  });
});
