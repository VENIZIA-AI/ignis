import { describe, expect, test } from 'bun:test';
import * as coreBarrel from '@/core';
import * as rootBarrel from '@/index';

/** Consumers name the definition through the kernel's `RequestErrors`; a second public name for it would be two answers to one question. */
describe('the malformed-body catalog', () => {
  test('the root barrel carries readFormBody but not RequestBodyErrors', () => {
    expect(Object.keys(rootBarrel)).not.toContain('RequestBodyErrors');
    expect(rootBarrel.readFormBody).toBe(coreBarrel.readFormBody);
  });

  test('/core still carries it, for the kernel', () => {
    expect(coreBarrel.RequestBodyErrors.BODY_MALFORMED.message.code).toBe(
      'core.request.body_malformed',
    );
  });
});
