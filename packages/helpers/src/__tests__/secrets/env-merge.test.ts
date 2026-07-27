import { describe, expect, test } from 'bun:test';
import { ApplicationEnvironment } from '@/modules/env/app-env';

describe('ApplicationEnvironment.merge', () => {
  test('adds and overrides keys read back via get', () => {
    const env = new ApplicationEnvironment({ prefix: 'APP_ENV', envs: { APP_ENV_A: '1' } });
    env.merge({ envs: { APP_ENV_A: '2', APP_ENV_B: '3' } });
    expect(env.get<string>('APP_ENV_A')).toBe('2');
    expect(env.get<string>('APP_ENV_B')).toBe('3');
  });
});
