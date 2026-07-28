import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import { ModuleUtility } from '@/utilities/module.utility';
import { SecretProviders, type ISecretsHelper, type ISecretsRegistration } from './common';
import { SystemEnvsHelper } from './system-envs';

// node-vault / @dotenvx/dotenvx are optional peers reached only via `ModuleUtility.load`: never eagerly loaded, invisible to bundlers. Compiled apps that use a provider must ship the peer in node_modules, inject the client via options, or register it with `ModuleUtility.register`.
export async function createSecretsHelper(
  opts: ISecretsRegistration & { identifier?: string },
): Promise<ISecretsHelper> {
  const shared = {
    identifier: opts.identifier,
    cacheTtlSeconds: opts.cacheTtlSeconds,
    renewBeforeRatio: opts.renewBeforeRatio,
  };

  const config = opts.config as AnyType;

  switch (opts.provider) {
    case SecretProviders.SYSTEM_ENVS: {
      return new SystemEnvsHelper({ identifier: opts.identifier });
    }
    case SecretProviders.HASHICORP_VAULT: {
      // `client` is the injected escape: the helper never reaches for the peer, so demanding it here would defeat the escape.
      if (!config?.client) {
        ModuleUtility.assertInstalled({
          scope: 'HashiCorpVaultHelper',
          modules: ['node-vault'],
          allowRegistered: true,
        });
      }
      const { HashiCorpVaultHelper } = (await import('./hashicorp/index.js')) as AnyType;
      return new HashiCorpVaultHelper({ ...config, ...shared });
    }
    case SecretProviders.DOTENV_VAULT: {
      // `decode` is the injected escape - same reasoning as `client` above.
      if (!config?.decode) {
        ModuleUtility.assertInstalled({
          scope: 'DotenvVaultHelper',
          modules: ['@dotenvx/dotenvx'],
          allowRegistered: true,
        });
      }
      const { DotenvVaultHelper } = (await import('./dotenv/index.js')) as AnyType;
      return new DotenvVaultHelper({ ...config, ...shared });
    }
    default: {
      throw getError({
        message: `[createSecretsHelper] Unsupported secret provider: ${opts.provider}`,
      });
    }
  }
}
