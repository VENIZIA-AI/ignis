import { describe, expect, test } from 'bun:test';
import { DefaultCRUDRepository, SoftDeletableRepository } from '@/relational/postgres/repositories';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

const itemTable = pgTable('where_required_items', {
  id: serial('id').primaryKey(),
  name: text('name'),
  deletedAt: timestamp('deleted_at'),
});

/** Never called: the checks are in the types, and `@ts-expect-error` turns red the day one stops failing. */
const typeChecks = (opts: {
  crud: DefaultCRUDRepository<typeof itemTable>;
  soft: SoftDeletableRepository<typeof itemTable>;
}) => {
  const { crud, soft } = opts;

  return [
    // @ts-expect-error where is required
    crud.updateBy({ data: { name: 'x' } }),
    // @ts-expect-error where is required
    crud.deleteBy({}),
    // @ts-expect-error where is required
    soft.deleteBy({}),
    // @ts-expect-error where is required
    soft.restoreBy({}),
    // @ts-expect-error removed: use updateBy
    crud.updateAll,
    // @ts-expect-error removed: use deleteBy
    crud.deleteAll,
    // @ts-expect-error removed: use restoreBy
    soft.restoreAll,
  ];
};

describe('one name per operation, and where is required', () => {
  test('updateAll, deleteAll and restoreAll no longer exist on a repository', () => {
    const crud = new DefaultCRUDRepository<typeof itemTable>(undefined);
    const soft = new SoftDeletableRepository<typeof itemTable>(undefined);

    expect('updateAll' in crud).toBe(false);
    expect('deleteAll' in crud).toBe(false);
    expect('restoreAll' in soft).toBe(false);
    expect(typeof typeChecks).toBe('function');
  });
});
