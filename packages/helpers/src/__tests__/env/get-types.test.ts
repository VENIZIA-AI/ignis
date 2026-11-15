import { describe, expect, test } from 'bun:test';
import { ApplicationEnvironment } from '@/modules/env';

const environment = new ApplicationEnvironment({ prefix: 'APP_ENV', envs: { APP_ENV_N: '7' } });

describe('ApplicationEnvironment.get - the type of each form', () => {
  test('a transform with a default answers the converted type, not number | undefined', () => {
    const present: number = environment.get('APP_ENV_N', {
      transform: (raw) => (raw === undefined ? undefined : Number(raw)),
      defaultValue: 5000,
    });
    const absent: number = environment.get('APP_ENV_MISSING', {
      transform: (raw) => (raw === undefined ? undefined : Number(raw)),
      defaultValue: 5000,
    });

    expect(present).toBe(7);
    expect(absent).toBe(5000);
  });

  test('a stored non-string (set from untyped code) is read as it is, not refused', () => {
    const untyped: { set(key: string, value: unknown): void } = environment;
    untyped.set('APP_ENV_RAW', 3);

    expect(Object.is(environment.get('APP_ENV_RAW'), 3)).toBe(true);
    expect(Object.is(environment.get('APP_ENV_RAW', { defaultValue: 'x' }), 3)).toBe(true);
  });
});
