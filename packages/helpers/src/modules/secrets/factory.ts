import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import { validateModule } from '@/utilities/module.utility';
import { SecretProviders, type ISecretsHelper, type ISecretsRegistration } from './common';
import { SystemEnvsHelper } from './system-envs';

// node-vault / @dotenvx/dotenvx are optional peers reached only via `importOptionalModule`: never
// eagerly loaded, invisible to bundlers. Compiled apps that use a provider must ship the peer in
// node_modules or inject the client via options.
export async function createSecretsHelper(
  opts: ISecretsRegistration & { identifier?: string },
): Promise<ISecretsHelper> {
  const shared = {
    identifier: opts.identifier,
    cacheTtlSeconds: opts.cacheTtlSeconds,
    renewBeforeRatio: opts.renewBeforeRatio,
  };

  switch (opts.provider) {
    case SecretProviders.SYSTEM_ENVS: {
      return new SystemEnvsHelper({ identifier: opts.identifier });
    }
    case SecretProviders.HASHICORP_VAULT: {
      await validateModule({ scope: 'HashiCorpVaultHelper', modules: ['node-vault'] });
      const { HashiCorpVaultHelper } = (await import('./hashicorp/index.js')) as AnyType;
      return new HashiCorpVaultHelper({ ...(opts.config as AnyType), ...shared });
    }
    case SecretProviders.DOTENV_VAULT: {
      await validateModule({ scope: 'DotenvVaultHelper', modules: ['@dotenvx/dotenvx'] });
      const { DotenvVaultHelper } = (await import('./dotenv/index.js')) as AnyType;
      return new DotenvVaultHelper({ ...(opts.config as AnyType), ...shared });
    }
    default: {
      throw getError({
        message: `[createSecretsHelper] Unsupported secret provider: ${opts.provider}`,
      });
    }
  }
}
