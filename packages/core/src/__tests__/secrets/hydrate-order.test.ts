import { BaseApplication } from '@/base/applications/base';
import { SecretProviders, type AnyType, type ISecretsRegistration } from '@venizia/ignis-helpers';
import { describe, expect, test } from 'bun:test';

class OrderApp extends BaseApplication {
  order: string[] = [];

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
    this.order.push('hydrate');
    return { provider: SecretProviders.SYSTEM_ENVS };
  }

  override async registerDataSources() {
    this.order.push('datasources');
  }
  override async registerComponents() {}
  override async registerControllers() {}
  override async registerDefaultMiddlewares() {}
}

describe('lifecycle order', () => {
  test('hydrateSecrets precedes registerDataSources', async () => {
    const app = new OrderApp({ scope: 'probe', config: {} as AnyType });
    await app.initialize();
    expect(app.order).toEqual(['hydrate', 'datasources']);
  });
});
