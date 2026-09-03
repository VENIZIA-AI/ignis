import { afterEach, describe, expect, test, spyOn } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { PostgresFilterBuilder } from '@/relational/postgres/repositories/dialect/filter';
import { MetadataRegistry } from '@venizia/ignis-kernel';

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
  /**
   * Restored from afterEach, never from the end of a test body: `MetadataRegistry.getInstance` is a
   * realm-anchored singleton accessor, so one failed assertion would otherwise leave the stub
   * installed for the rest of the run and every later test would fail on someone else's mock.
   */
  const installedSpies: Array<{ mockRestore: () => void }> = [];

  afterEach(() => {
    while (installedSpies.length > 0) {
      installedSpies.pop()?.mockRestore();
    }
  });

  test('build() without include never resolves relations', () => {
    const builder = new PostgresFilterBuilder();
    const spy = spyOn(builder, 'resolveRelations');
    installedSpies.push(spy);

    builder.build({ tableName: 'memo_parent', schema: parentTable, filter: { where: { id: 1 } } });

    expect(spy).not.toHaveBeenCalled();
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
    installedSpies.push(mockGetInstance);

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
  });
});
