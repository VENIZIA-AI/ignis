import { z } from '@hono/zod-openapi';
import { getError, keysToCamel, toCamel } from '@venizia/ignis-helpers/core';
import type { TEntityId } from './types';

/** The only way into `TEntityId`. Rejects an empty string - an id that is `''` collapses a `where` to no condition. */
export const toEntityId = (opts: { value: string }): TEntityId => {
  if (opts.value.length === 0) {
    throw getError({ message: '[toEntityId] Refusing an empty string as an entity id' });
  }

  return opts.value as TEntityId;
};

type TSnakeToCamelCase<S extends string> = S extends `${infer T}_${infer U}`
  ? `${T}${Capitalize<TSnakeToCamelCase<U>>}`
  : S;

type TCamelCaseKeys<T extends z.ZodRawShape> = {
  [K in keyof T as K extends string ? TSnakeToCamelCase<K> : K]: T[K] extends z.ZodType<infer U>
    ? z.ZodType<U>
    : T[K];
};

export const snakeToCamel = <T extends z.ZodRawShape>(shape: T) => {
  const camelShape = Object.fromEntries(
    Object.entries(shape).map(([key, value]) => {
      return [toCamel(key), value];
    }),
  ) as TCamelCaseKeys<T>;

  return z
    .object(shape)
    .transform(data => keysToCamel(data))
    .pipe(z.object(camelShape));
};
