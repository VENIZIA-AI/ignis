import { describe, test, expect } from 'bun:test';
import {
  TypesenseImportActions,
  TypesenseDirtyValues,
} from '@/modules/search-engine/typesense/types';

describe('TypesenseImportActions', () => {
  test('exposes the four actions', () => {
    expect(TypesenseImportActions.CREATE).toBe('create');
    expect(TypesenseImportActions.UPSERT).toBe('upsert');
    expect(TypesenseImportActions.UPDATE).toBe('update');
    expect(TypesenseImportActions.EMPLACE).toBe('emplace');
  });
  test('isValid accepts known and rejects unknown', () => {
    expect(TypesenseImportActions.isValid('upsert')).toBe(true);
    expect(TypesenseImportActions.isValid('nope')).toBe(false);
  });
});

describe('TypesenseDirtyValues', () => {
  test('isValid accepts known and rejects unknown', () => {
    expect(TypesenseDirtyValues.isValid('coerce_or_drop')).toBe(true);
    expect(TypesenseDirtyValues.isValid('reject')).toBe(true);
    expect(TypesenseDirtyValues.isValid('bad')).toBe(false);
  });
});
