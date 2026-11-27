import { BaseApplication } from '@/base/applications/base';
import { CoreBindings } from '@venizia/ignis-kernel';
import { AppEnvs, SecretProviders, type ISecretsRegistration } from '@venizia/ignis-helpers';
import { describe, expect, test } from 'bun:test';

class HydrateApp extends BaseApplication {
  override getProjectRoot() {
    return process.cwd();
  }

  override getAppInfo() {
    return { name: 'probe', version: '0', description: '' };
  }

  override staticConfigure() {}
  override preConfigure() {}
  override postConfigure() {}
  override setupMiddlewares() {}
  override registerSecrets(): ISecretsRegistration {
    return {
      provider: SecretProviders.SYSTEM_ENVS,
      hydrate: [{ path: 'ignored', keys: { SOURCE: 'APP_ENV_TARGET' } }],
    };
  }
}

describe('hydrateSecrets', () => {
  test('binds a provider at @app/config and merges mapped keys into AppEnvs', async () => {
    process.env.SOURCE = 'hydrated';
    const app = new HydrateApp({ scope: 'probe', config: { path: { base: '', isStrict: false } } });
    await app.hydrateSecrets();
    const provider = app.get({ key: CoreBindings.APPLICATION_CONFIG, isOptional: false });
    expect(provider).toBeDefined();
    expect(AppEnvs.get('APP_ENV_TARGET')).toBe('hydrated');
    expect(process.env.APP_ENV_TARGET).toBe('hydrated');
  });
});
