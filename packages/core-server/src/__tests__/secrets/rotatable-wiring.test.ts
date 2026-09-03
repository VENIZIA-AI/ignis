import { BaseApplication } from '@/base/applications/base';
import { BaseComponent } from '@venizia/ignis-kernel';
import { BindingNamespaces } from '@venizia/ignis-kernel';
import { BindingScopes } from '@venizia/ignis-kernel';
import { type AnyType } from '@venizia/ignis-helpers/common';
import {
  SecretProviders,
  type ISecretRotatable,
  type ISecretsHelper,
} from '@venizia/ignis-helpers';
import { describe, expect, test } from 'bun:test';

const COMPONENT_DATASOURCE_KEY = `${BindingNamespaces.DATASOURCE}.ComponentDataSource`;

/** Records the rotatables wired so the ordering fix can be asserted end to end. */
class RecordingProvider {
  wired: string[] = [];
  registerRotatable(opts: { key: string; target: ISecretRotatable }) {
    this.wired.push(opts.key);
  }
  async shutdown() {}
}

/** A component that contributes a datasource - the case the early wiring silently skipped. */
class DataSourceContributingComponent extends BaseComponent {
  constructor(private readonly application: BaseApplication) {
    super({ scope: DataSourceContributingComponent.name });
  }

  binding(): void {
    this.application
      .bind({ key: COMPONENT_DATASOURCE_KEY })
      .toValue({
        configure: async () => {},
        onSecretRotated: async () => {},
      } as AnyType)
      .setScope(BindingScopes.SINGLETON);
  }
}

class ComponentDataSourceApp extends BaseApplication {
  readonly provider = new RecordingProvider();

  override getProjectRoot() {
    return process.cwd();
  }
  override getAppInfo() {
    return { name: 'probe', version: '0', description: '' } as AnyType;
  }
  override staticConfigure() {}
  override postConfigure() {}
  override setupMiddlewares() {}
  override async registerDefaultMiddlewares() {}
  override async registerControllers() {}

  override preConfigure() {
    this.bind({ key: `${BindingNamespaces.COMPONENT}.DataSourceContributingComponent` })
      .toValue(new DataSourceContributingComponent(this))
      .setScope(BindingScopes.SINGLETON);
  }

  override async hydrateSecrets() {
    this.secretsProvider = this.provider as unknown as ISecretsHelper;
    this.secretsRegistration = {
      provider: SecretProviders.SYSTEM_ENVS,
      lease: [{ key: COMPONENT_DATASOURCE_KEY, path: 'db/creds/app' }],
    };
  }
}

describe('wireSecretRotatables ordering', () => {
  test('a datasource contributed by a component is still wired as a rotatable', async () => {
    const app = new ComponentDataSourceApp({ scope: 'probe', config: {} as AnyType });
    await app.initialize();
    expect(app.provider.wired).toEqual([COMPONENT_DATASOURCE_KEY]);
  });
});
