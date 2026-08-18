/** isRedisHelper - the brand check that replaced `instanceof AbstractRedisHelper` at the two component call sites. */

import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { AnyType } from '@/common/types';
import { AbstractRedisHelper, isRedisHelper, REDIS_HELPER_BRAND } from '@/modules/redis';

const buildHelper = () => {
  return new AbstractRedisHelper({
    scope: 'IsRedisHelperTest',
    identifier: 'is-redis-helper',
    client: new EventEmitter() as AnyType,
  });
};

describe('isRedisHelper', () => {
  it('accepts a real helper', () => {
    expect(isRedisHelper(buildHelper())).toBe(true);
  });

  it('accepts a helper built by a SECOND copy of this package', () => {
    // A second installed copy is a different class object built from the same source: `instanceof`
    // against the local class is false for it, the brand is not. This is the whole reason the check
    // moved off `instanceof` - reproduced here, since no test can install two copies.
    class ForeignRedisHelper {
      readonly [REDIS_HELPER_BRAND] = true;
    }

    const foreign = new ForeignRedisHelper();

    expect(foreign instanceof AbstractRedisHelper).toBe(false);
    expect(isRedisHelper(foreign)).toBe(true);
  });

  it('rejects anything without the brand', () => {
    expect(isRedisHelper(null)).toBe(false);
    expect(isRedisHelper(undefined)).toBe(false);
    expect(isRedisHelper({})).toBe(false);
    expect(isRedisHelper({ client: {}, name: 'looks-like-one' })).toBe(false);
    expect(isRedisHelper('redis')).toBe(false);
    expect(isRedisHelper(AbstractRedisHelper)).toBe(false);
  });

  it('anchors the brand on Symbol.for, so both copies compute the same key', () => {
    // `keyFor` returns a value ONLY for a registry symbol, so this pins the exact key and proves
    // the symbol is realm-wide in one assertion - a plain `Symbol()` would return undefined.
    expect(Symbol.keyFor(REDIS_HELPER_BRAND)).toBe('@venizia/ignis-helpers:abstract-redis-helper');
  });
});
