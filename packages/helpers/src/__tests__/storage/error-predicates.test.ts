import { describe, expect, test } from 'bun:test';
import { StorageUtility } from '@/modules/storage/common/utility';

describe('StorageUtility error predicates', () => {
  test('isNotFoundError reads the status, the code or the name', () => {
    for (const error of [
      { statusCode: 404 },
      { status: 404 },
      { code: 'NoSuchKey' },
      { name: 'NotFound' },
      Object.assign(new Error('gone'), { code: 'NoSuchBucket' }),
    ]) {
      expect(StorageUtility.isNotFoundError({ error })).toBe(true);
    }

    for (const error of [undefined, null, 404, 'NoSuchKey', {}, { status: '404' }, { code: 1 }]) {
      expect(StorageUtility.isNotFoundError({ error })).toBe(false);
    }
  });

  test('isPreconditionFailedError reads the status', () => {
    expect(StorageUtility.isPreconditionFailedError({ error: { statusCode: 412 } })).toBe(true);
    expect(StorageUtility.isPreconditionFailedError({ error: { status: 412 } })).toBe(true);

    for (const error of [undefined, null, 412, {}, { status: 404 }]) {
      expect(StorageUtility.isPreconditionFailedError({ error })).toBe(false);
    }
  });
});
