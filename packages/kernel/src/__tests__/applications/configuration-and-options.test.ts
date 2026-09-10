import type { IApplicationInfo } from '@/base/applications/common';
import { RestApplication } from '@/base/applications/rest';
import { BaseComponent } from '@/base/components';
import { BaseConfiguration } from '@/base/configurations';
import { configuration, provide } from '@/base/metadata';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class TestApplication extends RestApplication {
  readonly executionLog: string[] = [];

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'config-test-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

const buildApp = () =>
  new TestApplication({
    scope: TestApplication.name,
    config: { host: '127.0.0.1', port: 0, path: { base: '/', isStrict: false } },
  });

describe('@configuration ordering and topological sort', () => {
  test('executes diamond dependencies in topological order with name tie-breaking', async () => {
    const app = buildApp();

    @configuration()
    class ConfigA extends BaseConfiguration {
      override setup() {
        app.executionLog.push('ConfigA');
      }
    }

    @configuration({ after: [ConfigA] })
    class ConfigC extends BaseConfiguration {
      override setup() {
        app.executionLog.push('ConfigC');
      }
    }

    @configuration({ after: [ConfigA] })
    class ConfigB extends BaseConfiguration {
      override setup() {
        app.executionLog.push('ConfigB');
      }
    }

    @configuration({ after: [ConfigB, ConfigC] })
    class ConfigD extends BaseConfiguration {
      override setup() {
        app.executionLog.push('ConfigD');
      }
    }

    // Pass shuffled order in artifacts
    await app.registerArtifacts({
      configurations: [ConfigD, ConfigC, ConfigA, ConfigB],
    });

    await app.initialize();

    // ConfigA must run first. ConfigB and ConfigC both depend on ConfigA.
    // Sibling tie-breaker: 'ConfigB'.localeCompare('ConfigC') < 0, so ConfigB before ConfigC.
    // ConfigD depends on both, so ConfigD must be last.
    expect(app.executionLog).toEqual(['ConfigA', 'ConfigB', 'ConfigC', 'ConfigD']);
  });

  test('detects dependency cycles and throws', async () => {
    const app = buildApp();

    class CycleA extends BaseConfiguration {}
    class CycleB extends BaseConfiguration {}

    // Attach metadata with circular dependencies
    configuration({ after: [CycleB] })(CycleA);
    configuration({ after: [CycleA] })(CycleB);

    expect(
      app.registerArtifacts({
        configurations: [CycleA, CycleB],
      }),
    ).rejects.toThrow(/Dependency cycle detected in configurations: CycleA, CycleB/);
  });

  test('throws when an unregistered configuration is declared in after', async () => {
    const app = buildApp();

    class GhostConfig extends BaseConfiguration {}

    @configuration({ after: [GhostConfig] })
    class DependentConfig extends BaseConfiguration {}

    expect(
      app.registerArtifacts({
        configurations: [DependentConfig],
      }),
    ).rejects.toThrow(/Declared 'after' dependency 'GhostConfig' is not registered/);
  });
});

describe('configuration @provide and options pass-through to components', () => {
  test('@configuration binds @provide keys and can provide values for components', async () => {
    const app = buildApp();

    @configuration()
    class FeatureConfig extends BaseConfiguration {
      @provide({ key: 'configurations.apiKey' })
      apiKey(): string {
        return 'secret-api-key-123';
      }
    }

    await app.registerArtifacts({
      configurations: [FeatureConfig],
    });

    await app.initialize();
    expect(app.get<string>({ key: 'configurations.apiKey' })).toBe('secret-api-key-123');
  });

  test('application.component receives strongly-typed options and passes them to configure()', async () => {
    const app = buildApp();
    interface IMailOptions {
      provider: string;
      apiKey: string;
    }

    let receivedOptions: IMailOptions | undefined;

    class MailComponent extends BaseComponent<IMailOptions> {
      constructor() {
        super({ scope: MailComponent.name });
      }

      override binding() {}

      override configure(opts?: IMailOptions): Promise<void> {
        receivedOptions = opts;
        return super.configure(opts);
      }
    }

    app.component(MailComponent, {
      options: {
        provider: 'amazon-ses',
        apiKey: 'ses-key-456',
      },
    });

    await app.initialize();

    expect(receivedOptions).toEqual({
      provider: 'amazon-ses',
      apiKey: 'ses-key-456',
    });
  });

  test('component registered with no options receives undefined without error', async () => {
    const app = buildApp();
    let configured = false;

    class EmptyOptionsComponent extends BaseComponent {
      constructor() {
        super({ scope: EmptyOptionsComponent.name });
      }
      override binding() {}
      override configure(opts?: object): Promise<void> {
        expect(opts).toBeUndefined();
        configured = true;
        return super.configure(opts);
      }
    }

    app.component(EmptyOptionsComponent);
    await app.initialize();

    expect(configured).toBe(true);
  });
});
