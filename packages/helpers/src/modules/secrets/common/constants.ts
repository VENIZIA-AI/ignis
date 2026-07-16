import type { TConstValue } from '@/common/types';

export class SecretProviders {
  static readonly SYSTEM_ENVS = 'system-envs';
  static readonly HASHICORP_VAULT = 'hashicorp-vault';
  static readonly DOTENV_VAULT = 'dotenv-vault';

  static readonly SCHEME_SET = new Set([this.SYSTEM_ENVS, this.HASHICORP_VAULT, this.DOTENV_VAULT]);

  static isValid(value: string): value is TSecretProvider {
    return this.SCHEME_SET.has(value);
  }
}

export type TSecretProvider = TConstValue<typeof SecretProviders>;

export class VaultAuthMethods {
  static readonly TOKEN = 'token';
  static readonly APP_ROLE = 'app-role';
  static readonly KUBERNETES = 'kubernetes';

  static readonly SCHEME_SET = new Set([this.TOKEN, this.APP_ROLE, this.KUBERNETES]);

  static isValid(value: string): value is TVaultAuthMethod {
    return this.SCHEME_SET.has(value);
  }
}

export type TVaultAuthMethod = TConstValue<typeof VaultAuthMethods>;
