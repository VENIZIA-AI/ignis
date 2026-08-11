import { BaseApplication } from '@/base/applications/base';
import { SecretProviders, type AnyType, type ISecretsRegistration } from '@venizia/ignis-helpers';
import { afterEach, describe, expect, test } from 'bun:test';
import { expectRejection } from '../rejection.helper';

class FailingSecretsApp extends BaseApplication {
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
    // system-envs cannot fail; force a failure by pointing at a provider whose configure throws.
    return {
      provider: SecretProviders.HASHICORP_VAULT,
      config: { endpoint: 'http://127.0.0.1:1', auth: { method: 'token', token: 'x' } },
    };
  }
}

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('hydrateSecrets failure mode', () => {
  test('development env falls back without throwing', async () => {
    process.env.NODE_ENV = 'development';
    const app = new FailingSecretsApp({ scope: 'probe', config: {} as AnyType });

    expect(await app.hydrateSecrets()).toBeUndefined();
  });

  test('production env throws ApplicationError', async () => {
    process.env.NODE_ENV = 'production';
    const app = new FailingSecretsApp({ scope: 'probe', config: {} as AnyType });

    await expectRejection({
      task: app.hydrateSecrets(),
      message: /non-development environment/,
    });
  });
});
