import { describe, test, expect } from 'bun:test';
import { PersistableRepository } from '@/base/repositories';

/**
 * A null/undefined id must NOT reach the database: { id: undefined } collapses to an
 * empty where (toWhere drops undefined values), which would otherwise turn
 * updateById/deleteById into a table-wide mutation. Falsy-but-valid ids (0, '') are fine.
 */
class TestRepository extends PersistableRepository<any> {
  constructor() {
    super(undefined, {});
    // Mock entity so the guard's error message can resolve without DB metadata.
    this.entity = { name: 'TestEntity' } as any;
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
    const message = await rejectionMessage(repo.updateById({ id: undefined as any, data: {} }));
    expect(message).toMatch(/null or undefined/);
  });

  test('updateById rejects null id', async () => {
    const message = await rejectionMessage(repo.updateById({ id: null as any, data: {} }));
    expect(message).toMatch(/null or undefined/);
  });

  test('deleteById rejects undefined id', async () => {
    const message = await rejectionMessage(repo.deleteById({ id: undefined as any }));
    expect(message).toMatch(/null or undefined/);
  });

  test('deleteById rejects null id', async () => {
    const message = await rejectionMessage(repo.deleteById({ id: null as any }));
    expect(message).toMatch(/null or undefined/);
  });
});
