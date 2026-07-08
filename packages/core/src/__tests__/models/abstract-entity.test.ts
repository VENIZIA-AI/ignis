import { describe, test, expect } from 'bun:test';
import { AbstractEntity } from '@/base/models';
import { BasePostgresEntity } from '@/connectors/postgres/models';

class NoteDocument extends AbstractEntity {
  constructor() {
    super({ name: 'notes' });
  }
  getSchema<T = unknown>(): T {
    return { name: 'notes' } as T;
  }
}

describe('AbstractEntity root', () => {
  test('BasePostgresEntity extends AbstractEntity', () => {
    expect(BasePostgresEntity.prototype instanceof AbstractEntity).toBe(true);
  });
  test('a non-SQL entity works without a pgTable', () => {
    const doc = new NoteDocument();
    expect(doc.name).toBe('notes');
    expect(doc.toJSON()).toMatchObject({ name: 'notes' });
  });
});
