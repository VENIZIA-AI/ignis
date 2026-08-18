import type { IBootOptions } from '@venizia/ignis-boot';
import type { IApplicationBootOptions } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';

/**
 * The kernel cannot import boot's `IBootOptions` - boot sits beside the kernel in the build chain,
 * not before it - so `IApplicationBootOptions` mirrors its shape by hand. Nothing else ties the two
 * together, and the mirror is already the thinner of the pair: `IBootOptions` names four artifact
 * keys plus an index signature, the mirror carries only the index signature. They stay
 * interchangeable solely because the artifact option shapes still match field for field. This file
 * lives in core because core is the only package that depends on both.
 */
type TAssertMutuallyAssignable<TLeft, TRight> = TLeft extends TRight
  ? TRight extends TLeft
    ? true
    : never
  : never;

const areMutuallyAssignable: TAssertMutuallyAssignable<IBootOptions, IApplicationBootOptions> =
  true;

describe('kernel IApplicationBootOptions mirror', () => {
  test('stays interchangeable with boot IBootOptions', () => {
    // A drift in either shape makes the alias above `never`, which fails the build, not this
    // assertion - the runtime check exists so the tripwire is visible in the suite.
    expect(areMutuallyAssignable).toBe(true);
  });
});
