import type {
  AnyType,
  TAsyncResolver,
  TClass,
  TInjectTarget,
  TResolver,
  TValueOrAsyncResolver,
  TValueOrResolver,
} from './types';

/**
 * True for a value carrying nothing: `null`/`undefined`, an empty string, array, `Map`, `Set`, or an
 * object with no own enumerable keys. A number, boolean or function is empty too - it holds no
 * entries.
 *
 * Hand-written rather than `lodash/isEmpty`, and NOT a plain `!value`: `!{}` is `false` while an
 * empty object IS empty, so the two disagree on exactly the case a swap would silently flip.
 */
export const isEmpty = (opts: { value: unknown }): boolean => {
  const { value } = opts;

  if (value === null || value === undefined) {
    return true;
  }

  // The types that carry a MEANINGFUL length. Duck-typing on `.length` instead would call
  // `{ length: 0 }` empty, which it is not - it has an own key.
  if (typeof value === 'string' || Array.isArray(value) || ArrayBuffer.isView(value)) {
    return (value as { length: number }).length === 0;
  }

  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }

  if (typeof value !== 'object') {
    return true;
  }

  // Own keys only: `for...in` would walk the prototype chain and call an object with an inherited
  // property non-empty.
  return Object.keys(value).length === 0;
};

/**
 * A shallow copy without `keys`.
 *
 * Hand-written rather than `lodash/omit`: this package is bundled for browsers, where importing
 * lodash for one function costs 24 KB. Matches lodash on the shapes we pass it - a flat key list,
 * never a nested path.
 */
export const omit = <T extends object, K extends PropertyKey>(opts: {
  source: T;
  keys: readonly K[];
}): Omit<T, Extract<K, keyof T>> => {
  const { source, keys } = opts;
  const dropped = new Set<PropertyKey>(keys);
  const kept: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (dropped.has(key)) {
      continue;
    }

    kept[key] = value;
  }

  return kept as Omit<T, Extract<K, keyof T>>;
};

/** Tells a CONSTRUCTOR from a RESOLVER via source text - `prototype !== undefined` is true of every non-arrow function. Sound only on ES2020+ output (classes emit as `class`); ES5 bundling breaks it. */
export const isClass = <T>(target: any): target is TClass<T> => {
  if (typeof target !== 'function' || target.prototype === undefined) {
    return false;
  }

  return /^class[\s{]/.test(Function.prototype.toString.call(target));
};

/** A resolver is anything callable that is not a class - a class is a value here, never a factory. */
const isResolver = <T>(valueOrResolver: TValueOrResolver<T>): valueOrResolver is TResolver<T> =>
  typeof valueOrResolver === 'function' && !isClass(valueOrResolver);

/** Reads a value-or-resolver. A class constructor is returned as-is; only a plain function is called. */
export const resolveValue = <T>(valueOrResolver: TValueOrResolver<T>): T =>
  isResolver(valueOrResolver) ? valueOrResolver() : valueOrResolver;

const isAsyncResolver = <T>(
  valueOrResolver: TValueOrAsyncResolver<T>,
): valueOrResolver is TAsyncResolver<T> =>
  typeof valueOrResolver === 'function' && !isClass(valueOrResolver);

/** `resolveValue` for a resolver that may answer a promise. */
export const resolveValueAsync = async <T>(
  valueOrResolver: TValueOrAsyncResolver<T>,
): Promise<T> => (isAsyncResolver(valueOrResolver) ? valueOrResolver() : valueOrResolver);

/** Reads what `@inject({ target })` named. The function form is called HERE, never at decoration: that is what lets a class reached through an import cycle be named at all. Answers `undefined` when the function hands back something that is not a class. The container resolves synchronously, so there is no async form. */
export const resolveInjectTarget = (target: TInjectTarget): TClass<AnyType> | undefined => {
  const resolved = resolveValue(target);
  return isClass(resolved) ? resolved : undefined;
};
