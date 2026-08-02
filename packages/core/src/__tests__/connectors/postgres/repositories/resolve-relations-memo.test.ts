import { describe, expect, test, spyOn } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { PostgresFilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';
import { MetadataRegistry } from '@/helpers/inversion';

const parentTable = pgTable('memo_parent', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }),
});

const childTable = pgTable('memo_child', {
  id: serial('id').primaryKey(),
  label: varchar('label', { length: 50 }),
});

/**
 * Relations resolve only when `include` is present, and memoize per schema: @model settings are
 * immutable after boot, so a second build() must not re-run the resolver.
 */
describe('FilterBuilder - resolveRelations guard + memoization', () => {
  test('build() without include never resolves relations', () => {
    const builder = new PostgresFilterBuilder();
    const spy = spyOn(builder, 'resolveRelations');

    builder.build({ tableName: 'memo_parent', schema: parentTable, filter: { where: { id: 1 } } });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('a second build() with include reuses the memoized relation resolution', () => {
    let resolverCallCount = 0;
    const relationsResolver = () => {
      resolverCallCount++;
      return [{ name: 'child', type: 'one', schema: childTable, metadata: undefined }];
    };

    const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
      getModelEntry: () => ({ relationsResolver, metadata: { type: 'entity', settings: {} } }),
    } as any);

    const builder = new PostgresFilterBuilder();

    builder.build({
      tableName: 'memo_parent',
      schema: parentTable,
      filter: { include: [{ relation: 'child' }] },
    });
    builder.build({
      tableName: 'memo_parent',
      schema: parentTable,
      filter: { include: [{ relation: 'child' }] },
    });

    expect(resolverCallCount).toBe(1);

    mockGetInstance.mockRestore();
  });
});
