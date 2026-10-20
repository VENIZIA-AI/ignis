/**
 * `EventBus`'s only type safety is `K extends keyof TPayloadMap & string`, so it is exactly as strong
 * as the map a consumer hands it. A map built from computed keys off a plain object literal
 * degrades to an INDEX SIGNATURE, which satisfies that constraint for every string - the bus then
 * looks type-safe from the call site and guarantees nothing.
 *
 * These are compile-time assertions; the runtime bodies exist only so the file is a valid test.
 * Each `@ts-expect-error` was verified load-bearing by deleting it and confirming `tsc` reports at
 * that line - the degraded case is proven by the ABSENCE of one, which is why the control below
 * asserts the bogus key resolves rather than trusting a clean compile.
 */

import { describe, expect, test } from 'bun:test';

/** No `as const`: every value widens to `string`. */
const LOOSE_EVENT_NAMES = { ORDER_PLACED: 'order.placed' };

/** `as const` keeps the literal type. A `static readonly` on a class does the same, which is why one
 * map in a codebase can be sound while its neighbour silently is not. */
const TIGHT_EVENT_NAMES = { ORDER_PLACED: 'order.placed' } as const;

interface ILoosePayloadMap {
  [LOOSE_EVENT_NAMES.ORDER_PLACED]: { orderId: string };
}

interface ITightPayloadMap {
  [TIGHT_EVENT_NAMES.ORDER_PLACED]: { orderId: string };
}

describe('EventBus payload map typing', () => {
  test('a map keyed off a non-const literal degrades to an index signature', () => {
    // No `@ts-expect-error`: this compiles, and that IS the defect. A name nobody declared resolves
    // to the declared payload type, so `register`/`publish` would accept it.
    const smuggled: ILoosePayloadMap['nothing.declares.this'] = { orderId: 'O1' };

    // `keyof` an index-signature map is `string`, not a union of declared names.
    const key: keyof ILoosePayloadMap = 'also.not.declared';

    expect(smuggled.orderId).toBe('O1');
    expect(key).toBe('also.not.declared');
  });

  test('`as const` restores the union, and an undeclared name stops resolving', () => {
    const declared: ITightPayloadMap['order.placed'] = { orderId: 'O1' };

    // @ts-expect-error 'nothing.declares.this' is not a key of the tight map
    const smuggled: ITightPayloadMap['nothing.declares.this'] = { orderId: 'O1' };

    // @ts-expect-error keyof the tight map is the literal union, not `string`
    const key: keyof ITightPayloadMap = 'also.not.declared';

    expect(declared.orderId).toBe('O1');
    expect(smuggled).toBeDefined();
    expect(key).toBeDefined();
  });
});
