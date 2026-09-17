import { resolveValue } from '@venizia/ignis-inversion';

import type { TClass, TResolver } from './types';

// The resolver vocabulary and its two readers live in inversion, the lowest layer, because the
// container branches on them. Re-exported here so the rest of the stack reaches them through the
// package it already depends on, instead of each layer redeclaring them.
export { isClass, isEmpty, omit, resolveValue, resolveValueAsync } from '@venizia/ignis-inversion';

/** Resolves a class reference, passing through string binding keys as-is. */
export const resolveClass = <T>(
  ref: TClass<T> | TResolver<TClass<T>> | string,
): TClass<T> | string => {
  if (typeof ref === 'string') {
    return ref;
  }

  return resolveValue(ref);
};
