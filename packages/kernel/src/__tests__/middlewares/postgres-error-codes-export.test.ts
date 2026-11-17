import { describe, expect, test } from 'bun:test';
import * as kernel from '@/index';

describe('kernel entry exports PostgresErrorCodes', () => {
  test('is a real runtime export of the package root', () => {
    expect(kernel.PostgresErrorCodes).toBeDefined();
    expect(kernel.PostgresErrorCodes.UNIQUE_VIOLATION).toBe('23505');
    expect(kernel.PostgresErrorCodes.FOREIGN_KEY_VIOLATION).toBe('23503');
  });
});
