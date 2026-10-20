import type { AnyType } from '@/common/types';
import { describe, expect, test } from 'bun:test';
import { createSecretsHelper } from '@/modules/secrets/factory';
import { SecretProviders } from '@/modules/secrets/common';
import { SystemEnvsHelper } from '@/modules/secrets/system-envs';

describe('createSecretsHelper', () => {
  test('builds SystemEnvsHelper for system-envs', async () => {
    const provider = await createSecretsHelper({ provider: SecretProviders.SYSTEM_ENVS });
    expect(provider).toBeInstanceOf(SystemEnvsHelper);
  });

  test('throws on unsupported provider', () => {
    return expect(createSecretsHelper({ provider: 'aws' as AnyType })).rejects.toThrow(
      /Unsupported secret provider/,
    );
  });
});
