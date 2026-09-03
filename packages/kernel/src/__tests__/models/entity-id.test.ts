/**
 * `TEntityId`'s whole value is that a plain `string` will not assign to it. A brand written the
 * wrong way still compiles and silently guarantees nothing, so the negative cases below are the
 * real subject - each `@ts-expect-error` was verified load-bearing by deleting it once and
 * confirming `tsc` reports an error at that line.
 */

import { describe, expect, test } from 'bun:test';
import { toEntityId } from '@/base/models/common/types';
import type { TEntityId } from '@/base/models/common/types';

describe('TEntityId', () => {
  test('a plain string does not assign - the reason the type exists', () => {
    // @ts-expect-error a bare string is not an entity id
    const rejected: TEntityId = 'M1';

    // Compared as a string: `toBe` would otherwise demand a TEntityId, which is the very thing
    // this test proves a literal cannot be.
    expect(rejected as string).toBe('M1');
  });

  test('toEntityId is the way in, and the value survives unchanged', () => {
    const id = toEntityId({ value: 'M1' });

    expect(id as string).toBe('M1');
  });

  test('an empty string is refused - it collapses a where clause to no condition', () => {
    expect(() => toEntityId({ value: '' })).toThrow();
  });

  test('a branded id still behaves as a string everywhere a string is expected', () => {
    const id = toEntityId({ value: 'M1' });
    const asString: string = id;

    expect(asString.toUpperCase()).toBe('M1');
    expect([id, 'x'].join(',')).toBe('M1,x');
  });

  /** The bug class this catches: both fields are strings at runtime, and only the brand separates them. */
  test('a name cannot be passed where an id is expected', () => {
    const record = { id: toEntityId({ value: 'M1' }), name: 'Cua hang A' };
    const findById = (opts: { id: TEntityId }) => opts.id;

    expect(findById({ id: record.id }) as string).toBe('M1');

    // @ts-expect-error a name is not an id, even though both are strings at runtime
    expect(findById({ id: record.name }) as string).toBe('Cua hang A');
  });
});
