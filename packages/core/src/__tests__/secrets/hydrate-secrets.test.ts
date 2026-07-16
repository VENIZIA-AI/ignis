import { BaseApplication } from '@/base/applications/base';
import { CoreBindings } from '@/common/bindings';
import {
  applicationEnvironment,
  SecretProviders,
  type AnyType,
  type ISecretsRegistration,
} from '@venizia/ignis-helpers';
import { describe, expect, test } from 'bun:test';

class HydrateApp extends BaseApplication {
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
      hydrate: [{ path: 'ignored', keys: { SOURCE: 'APP_ENV_TARGET' } }],
    };
  }
}

describe('hydrateSecrets', () => {
  test('binds a provider at @app/config and merges mapped keys into Envs', async () => {
    process.env.SOURCE = 'hydrated';
    const app = new HydrateApp({ scope: 'probe', config: {} as AnyType });
    await app.hydrateSecrets();
    const provider = app.get({ key: CoreBindings.APPLICATION_CONFIG, isOptional: false });
    expect(provider).toBeDefined();
    expect(applicationEnvironment.get<string>('APP_ENV_TARGET')).toBe('hydrated');
    expect(process.env.APP_ENV_TARGET).toBe('hydrated');
  });
});
