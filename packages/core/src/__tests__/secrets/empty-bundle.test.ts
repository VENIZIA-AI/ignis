import { BaseApplication } from '@/base/applications/base';
import { SecretProviders, type AnyType, type ISecretsRegistration } from '@venizia/ignis-helpers';
import { afterEach, describe, expect, test } from 'bun:test';

/**
 * The system-envs provider always returns a non-empty bundle (the whole process env), but a
 * `keys` mapping onto env names that do not exist resolves to nothing - the same empty-result a
 * misconfigured vault path produces.
 */
const MISSING_SOURCE = '__IGNIS_MISSING_SECRET_SOURCE__';

class EmptyHydrateApp extends BaseApplication {
  override getProjectRoot() {
    return process.cwd();
  }
  override getAppInfo() {
    return { name: 'probe', version: '0', description: '' } as AnyType;
  }
  override staticConfigure() {}
  override preConfigure() {}
  override postConfigure() {}
  override setupMiddlewares() {}
  override registerSecrets(): ISecretsRegistration {
    return {
      provider: SecretProviders.SYSTEM_ENVS,
      hydrate: [{ path: 'secret/data/app', keys: { [MISSING_SOURCE]: 'APP_ENV_MISSING_TARGET' } }],
    };
  }
}

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  delete process.env[MISSING_SOURCE];
});

describe('hydrateSecrets empty-bundle handling', () => {
  test('production: an empty bundle for a keyed hydrate entry fails closed', async () => {
    process.env.NODE_ENV = 'production';
    const app = new EmptyHydrateApp({ scope: 'probe', config: {} as AnyType });
    expect(app.hydrateSecrets()).rejects.toThrow(/empty secret bundle/i);
  });

  test('development: an empty bundle warns and boot continues', async () => {
    process.env.NODE_ENV = 'development';
    const app = new EmptyHydrateApp({ scope: 'probe', config: {} as AnyType });
    expect(app.hydrateSecrets()).resolves.toBeUndefined();
  });
});
