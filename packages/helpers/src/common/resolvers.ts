import { isClass } from '@venizia/ignis-inversion';

import type {
  TAsyncResolver,
  TClass,
  TResolver,
  TValueOrAsyncResolver,
  TValueOrResolver,
} from './types';

// Declared in inversion (the container branches on it), re-exported here so the rest of the stack reaches it through the one package it already depends on, instead of each layer redeclaring it.
export { isClass };

/** Resolves a value-or-resolver, returning class constructors as-is. */
export const resolveValue = <T>(valueOrResolver: TValueOrResolver<T>): T => {
  if (typeof valueOrResolver !== 'function') {
    return valueOrResolver;
  }

  if (isClass(valueOrResolver)) {
    return valueOrResolver as T;
  }

  return (valueOrResolver as TResolver<T>)();
};

/** Async version of resolveValue. */
export const resolveValueAsync = async <T>(
  valueOrResolver: TValueOrAsyncResolver<T>,
): Promise<T> => {
  if (typeof valueOrResolver !== 'function') {
    return valueOrResolver;
  }

  if (isClass(valueOrResolver)) {
    return valueOrResolver as T;
  }

  return (valueOrResolver as TAsyncResolver<T>)();
};

/** Resolves a class reference, passing through string binding keys as-is. */
export const resolveClass = <T>(
  ref: TClass<T> | TResolver<TClass<T>> | string,
): TClass<T> | string => {
  if (typeof ref === 'string') {
    return ref;
  }

  return resolveValue(ref);
};
