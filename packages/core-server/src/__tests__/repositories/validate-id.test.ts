import { describe, test, expect } from 'bun:test';
import { BasePostgresEntity, PersistableRepository } from '@venizia/ignis-connectors/postgres';
import { pgTable, serial } from 'drizzle-orm/pg-core';

const validateIdFixtureTable = pgTable('validate_id_fixture_entities', {
  id: serial('id').primaryKey(),
});

/** Real entity (not a mock) so the guard's error message resolves via the actual `entity.name`. */
class ValidateIdFixtureEntity extends BasePostgresEntity {
  static override schema = validateIdFixtureTable;
  static override TABLE_NAME = 'TestEntity';
}

/** A null/undefined id must NOT reach the database: `{ id: undefined }` collapses to an empty where, turning updateById/deleteById into a table-wide mutation. Falsy-but-valid ids (0, '') are fine. */
class TestRepository extends PersistableRepository<any> {
  constructor() {
    super(undefined, {});
    this.entity = new ValidateIdFixtureEntity();
  }

  callValidateId(id: unknown) {
    return this.validateId({ id, operationName: 'op' });
  }
}

describe('PersistableRepository.validateId', () => {
  const repo = new TestRepository();

  test('rejects null', () => {
    expect(() => repo.callValidateId(null)).toThrow(/null or undefined/);
  });

  test('rejects undefined', () => {
    expect(() => repo.callValidateId(undefined)).toThrow(/null or undefined/);
  });

  test('allows 0 (falsy but valid numeric id)', () => {
    expect(() => repo.callValidateId(0)).not.toThrow();
  });

  test('allows empty string (falsy but valid string id)', () => {
    expect(() => repo.callValidateId('')).not.toThrow();
  });

  test('allows normal string and number ids', () => {
    expect(() => repo.callValidateId('abc')).not.toThrow();
    expect(() => repo.callValidateId(123)).not.toThrow();
  });
});

describe('updateById / deleteById reject null & undefined id before executing', () => {
  const repo = new TestRepository();

  /** Awaits the operation and returns the rejection message (or null if it resolved). */
  async function rejectionMessage(op: Promise<unknown>): Promise<string | null> {
    try {
      await op;
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }

  test('updateById rejects undefined id', async () => {
    const message = await rejectionMessage(repo.updateById({ id: undefined, data: {} }));
    expect(message).toMatch(/null or undefined/);
  });

  test('updateById rejects null id', async () => {
    const message = await rejectionMessage(repo.updateById({ id: null, data: {} }));
    expect(message).toMatch(/null or undefined/);
  });

  test('deleteById rejects undefined id', async () => {
    const message = await rejectionMessage(repo.deleteById({ id: undefined }));
    expect(message).toMatch(/null or undefined/);
  });

  test('deleteById rejects null id', async () => {
    const message = await rejectionMessage(repo.deleteById({ id: null }));
    expect(message).toMatch(/null or undefined/);
  });
});
