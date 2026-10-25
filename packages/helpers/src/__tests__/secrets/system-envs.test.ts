import { describe, expect, test } from 'bun:test';
import { SystemEnvsHelper } from '@/modules/secrets/system-envs';

describe('SystemEnvsHelper', () => {
  test('get reads from process.env', async () => {
    process.env.APP_ENV_SECRETS_PROBE = 'from-env';
    const provider = new SystemEnvsHelper({});
    expect(await provider.get({ path: 'ignored', key: 'APP_ENV_SECRETS_PROBE' })).toBe('from-env');
  });

  test('lease throws NotSupported', async () => {
    const provider = new SystemEnvsHelper({});
    return expect(provider.lease({ path: 'db', key: 'k' })).rejects.toThrow(/not supported/i);
  });
});

describe('SystemEnvsHelper - an inherited property name is not a secret', () => {
  test.each(['constructor', 'toString', '__proto__'])(
    '%s falls back to the default',
    async (key) => {
      const provider = new SystemEnvsHelper({});

      expect(await provider.get({ path: 'ignored', key, defaultValue: 'fallback' })).toBe(
        'fallback',
      );
    },
  );
});
