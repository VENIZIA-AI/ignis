import { describe, expect, test } from 'bun:test';
import { SecretProviders, VaultAuthMethods } from '@/modules/secrets/common/constants';

describe('SecretProviders const-class', () => {
  test('exposes the three provider tokens', () => {
    expect(SecretProviders.SYSTEM_ENVS).toBe('system-envs');
    expect(SecretProviders.HASHICORP_VAULT).toBe('hashicorp-vault');
    expect(SecretProviders.DOTENV_VAULT).toBe('dotenv-vault');
  });

  test('isValid accepts known and rejects unknown', () => {
    expect(SecretProviders.isValid('hashicorp-vault')).toBe(true);
    expect(SecretProviders.isValid('aws')).toBe(false);
  });
});

describe('VaultAuthMethods const-class', () => {
  test('isValid accepts known and rejects unknown', () => {
    expect(VaultAuthMethods.isValid('app-role')).toBe(true);
    expect(VaultAuthMethods.isValid('oidc')).toBe(false);
  });
});
