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
  // @ts-expect-error a secret is unknown until the caller checks it
  const secret: string = await secrets.get({ path: 'p', key: 'k' });
  // @ts-expect-error a property read by path is unknown
  const value: number = ParseUtility.getDeepProperty({ source: {}, path: 'a' });

  return { text, count, texts, object, json, popped, reply, secret, value };
};

describe('values a caller used to name', () => {
  test('getDeepProperty answers what is at the path', () => {
    expect(ParseUtility.getDeepProperty({ source: { a: { b: 1 } }, path: 'a.b' })).toBe(1);
  });
});
