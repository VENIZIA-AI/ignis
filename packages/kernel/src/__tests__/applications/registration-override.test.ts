import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/types';
import { BaseComponent } from '@/base/components';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class ConcreteRestApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'registration-override-app', version: '0.0.0', description: '' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

class ProbeComponent extends BaseComponent {
  override binding(): ValueOrPromise<void> {}
}

class OtherProbeComponent extends BaseComponent {
  override binding(): ValueOrPromise<void> {}
}

const buildConfigs = (): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
});

describe('registration collision guard - allowOverride', () => {
  test('registering the same class twice does not throw by default (matches historical overwrite behavior)', () => {
    const application = new ConcreteRestApplication({
      scope: ConcreteRestApplication.name,
      config: buildConfigs(),
    });

    expect(() => application.component(ProbeComponent)).not.toThrow();
    expect(() => application.component(ProbeComponent)).not.toThrow();
  });

  test('a genuine collision under allowOverride: false throws', () => {
    const application = new ConcreteRestApplication({
      scope: ConcreteRestApplication.name,
      config: buildConfigs(),
    });

    application.component(ProbeComponent);

    expect(() => application.component(ProbeComponent, { allowOverride: false })).toThrow(
      /already registered/,
    );
  });

  test('allowOverride: false does not throw when the key is not yet bound', () => {
    const application = new ConcreteRestApplication({
      scope: ConcreteRestApplication.name,
      config: buildConfigs(),
    });

    expect(() =>
      application.component(OtherProbeComponent, { allowOverride: false }),
    ).not.toThrow();
  });

  test('a distinct opts.binding key avoids the collision entirely, even under allowOverride: false', () => {
    const application = new ConcreteRestApplication({
      scope: ConcreteRestApplication.name,
      config: buildConfigs(),
    });

    application.component(ProbeComponent);

    expect(() =>
      application.component(ProbeComponent, {
        binding: { namespace: 'components', key: 'ProbeComponentAlias' },
        allowOverride: false,
      }),
    ).not.toThrow();
  });
});
