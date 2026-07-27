import { describe, expect, test } from 'bun:test';
import { DotenvVaultHelper } from '@/modules/secrets/dotenv/dotenv.helper';

describe('DotenvVaultHelper', () => {
  test('getBundle returns the decoded env map', async () => {
    const provider = new DotenvVaultHelper({
      path: '.env.vault',
      dotenvKey: 'dotenv://:key_test@dotenvx.com/vault/.env.vault?environment=development',
      decode: () => ({ APP_ENV_DB_PASSWORD: 'decrypted' }),
    });
    await provider.configure();
    expect(await provider.getBundle({ path: 'ignored' })).toEqual({
      APP_ENV_DB_PASSWORD: 'decrypted',
    });
  });

  test('lease throws NotSupported', async () => {
    const provider = new DotenvVaultHelper({ decode: () => ({}) });
    return expect(provider.lease({ path: 'db', key: 'k' })).rejects.toThrow(/not supported/i);
  });
});
