import { describe, expect, test } from 'bun:test';
import type { IRedisHelper } from '@/modules/redis';
import type { ISecretsHelper } from '@/modules/secrets';
import { ParseUtility } from '@/utilities/parse.utility';

/** Type checks only: `bun check` fails when a caller can name a type nothing verifies. The function is never called. */
export const callerCannotName = async (opts: { redis: IRedisHelper; secrets: ISecretsHelper }) => {
  const { redis, secrets } = opts;

  const text: string | null = await redis.get({ key: 'k' });
  const count: number | null = await redis.get({ key: 'k', transform: Number });
  const texts: Array<string | null> = await redis.mGet({ keys: ['k'] });
  // An object whose transform may be set is neither call: the answer would be the transform's type or text.
  const optional: { key: string; transform?: (input: string) => number } = { key: 'k' };
  const optionalMany: { keys: string[]; transform?: (input: string) => number } = { keys: ['k'] };
  // @ts-expect-error a transform that may be set cannot be read as text
  await redis.get(optional);
  // @ts-expect-error a transform that may be set cannot be read as text
  await redis.mGet(optionalMany);
  // The input of a transform written in place is typed from the method.
  const length: number | null = await redis.get({ key: 'k', transform: (input) => input.length });
  const lengths: Array<number | null> = await redis.mGet({
    keys: ['k'],
    transform: (input) => input.length,
  });

  // @ts-expect-error a type argument needs a transform that answers it
  await redis.get<number>({ key: 'k' });
  // @ts-expect-error a type argument needs a transform that answers it
  await redis.mGet<number>({ keys: ['k'] });
  // @ts-expect-error getObject takes no type argument
  await redis.getObject<{ id: string }>({ key: 'k' });
  // @ts-expect-error a parsed value is unknown
  const object: { id: string } = await redis.getObject({ key: 'k' });
  // @ts-expect-error the JSON reply is unknown
  const json: { id: string } = await redis.jGet({ key: 'k' });
  // @ts-expect-error the popped value is unknown
  const popped: string = await redis.jPop({ key: 'k', path: '$' });
  // @ts-expect-error a raw reply is unknown
  const reply: string = await redis.execute('PING');
  const secret: string | undefined = await secrets.get({ path: 'p', key: 'k' });
  const fallback: string | number = await secrets.get({ path: 'p', key: 'k', defaultValue: 1 });
  const bundle: Record<string, string> = await secrets.get({ path: 'p' });
  const appended: Array<number | null> | number | null = await redis.jPush({
    key: 'k',
    path: '$',
    value: 1,
  });
  // @ts-expect-error a secret may be absent without a default
  const present: string = await secrets.get({ path: 'p', key: 'k' });
  // @ts-expect-error secrets.get takes no type of the answer
  await secrets.get<number>({ path: 'p', key: 'k' });
  // @ts-expect-error execute takes no type argument
  await redis.execute<number>('DBSIZE');
  // @ts-expect-error jGet takes no type argument
  await redis.jGet<{ id: string }>({ key: 'k' });
  // @ts-expect-error jPop takes no type argument
  await redis.jPop<{ id: string }>({ key: 'k', path: '$' });
  // @ts-expect-error getDeepProperty takes no type arguments
  ParseUtility.getDeepProperty<object, number>({ source: {}, path: 'a' });
  // @ts-expect-error a property read by path is unknown
  const value: number = ParseUtility.getDeepProperty({ source: {}, path: 'a' });

  return {
    length,
    lengths,
    text,
    count,
    texts,
    object,
    json,
    popped,
    reply,
    secret,
    fallback,
    bundle,
    appended,
    present,
    value,
  };
};

describe('values a caller used to name', () => {
  test('getDeepProperty answers what is at the path', () => {
    expect(ParseUtility.getDeepProperty({ source: { a: { b: 1 } }, path: 'a.b' })).toBe(1);
  });
});
