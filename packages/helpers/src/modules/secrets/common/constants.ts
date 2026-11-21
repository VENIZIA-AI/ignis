import type { TConstValue } from '@/common/types';
import { ConstClass } from '@/common/const-class';

/** Secret backends a secrets registration can select. */
export class SecretProviders extends ConstClass {
  static readonly SYSTEM_ENVS = 'system-envs';
  static readonly HASHICORP_VAULT = 'hashicorp-vault';
  static readonly DOTENV_VAULT = 'dotenv-vault';
}

/** Union of the `SecretProviders` values. */
export type TSecretProvider = TConstValue<typeof SecretProviders>;

/** Ways a Vault provider can authenticate. */
export class VaultAuthMethods extends ConstClass {
  static readonly TOKEN = 'token';
  static readonly APP_ROLE = 'app-role';
  static readonly KUBERNETES = 'kubernetes';
}

/** Union of the `VaultAuthMethods` values. */
export type TVaultAuthMethod = TConstValue<typeof VaultAuthMethods>;
