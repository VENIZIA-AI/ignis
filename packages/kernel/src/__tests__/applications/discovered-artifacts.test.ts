import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import { component, configuration, model, service } from '@/base/metadata';
import { MetadataRegistry } from '@/helpers/inversion';
import { BaseComponent } from '@/base/components';
import { BaseConfiguration } from '@/base/configurations';
import type { TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { beforeEach, describe, expect, test } from 'bun:test';

class DiscoveringApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'discovering-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

/** A second application class in the same process - the shape `when` has to tell apart. */
class OtherApplication extends DiscoveringApplication {}

@service()
class DiscoveredService {}

@service()
class DeclaredOnlyService {}

@component()
class DiscoveredComponent extends BaseComponent {
  constructor() {
    super({ scope: DiscoveredComponent.name });
  }
  override binding(): void {}
}

@configuration()
export class DiscoveredConfiguration extends BaseConfiguration {}

/** A model carries a binding namespace but no index field - its repository registers it. */
@model({ type: 'entity' })
class DiscoveredModel {}

@service({ when: ({ application }) => application instanceof OtherApplication })
export class OtherApplicationOnlyService {}

const buildApplication = <ApplicationType extends DiscoveringApplication>(opts: {
  ApplicationClass: TClass<ApplicationType>;
  configs?: Partial<IApplicationConfigs>;
}) => {
  const application = new opts.ApplicationClass({
    scope: opts.ApplicationClass.name,
    config: { path: { base: '/', isStrict: false }, ...opts.configs } as IApplicationConfigs,
  });
  application.init();
  return application;
};

describe('an application that declares no artifacts', () => {
  let application: DiscoveringApplication;

  beforeEach(() => {
    application = buildApplication({ ApplicationClass: DiscoveringApplication });
  });

  test('the decorated classes are discovered without listing one of them', async () => {
    await application.registerDiscoveredArtifacts();

    expect(application.isBound({ key: 'services.DiscoveredService' })).toBe(true);
    expect(application.isBound({ key: 'components.DiscoveredComponent' })).toBe(true);
    expect(application.isBound({ key: 'configurations.DiscoveredConfiguration' })).toBe(true);
  });

  test('a discovered @model is not registered as an artifact', async () => {
    await application.registerDiscoveredArtifacts();

    expect(application.isBound({ key: 'models.DiscoveredModel' })).toBe(false);
  });

  test('a when naming another application class keeps the class out of this one', async () => {
    await application.registerDiscoveredArtifacts();

    expect(application.isBound({ key: 'services.OtherApplicationOnlyService' })).toBe(false);
  });

  test('and the same class registers in the application its when names', async () => {
    const other = buildApplication({ ApplicationClass: OtherApplication });
    await other.registerDiscoveredArtifacts();

    expect(other.isBound({ key: 'services.OtherApplicationOnlyService' })).toBe(true);
  });
});

describe('discoverArtifacts is opt-in, and composes with a declared index', () => {
  test('a declared index alone registers what it lists and nothing else', async () => {
    const application = buildApplication({
      ApplicationClass: DiscoveringApplication,
      configs: { artifacts: { services: [DeclaredOnlyService] } },
    });

    await application.initialize();

    expect(application.isBound({ key: 'services.DeclaredOnlyService' })).toBe(true);
    expect(application.isBound({ key: 'services.DiscoveredService' })).toBe(false);
  });

  /**
   * The guard that matters. An absent `artifacts` has always meant "register nothing", and a
   * consumer builds a config that omits the key on purpose - reading it as "register everything"
   * would change what that application boots with, silently.
   */
  test('no artifacts and no flag registers nothing', async () => {
    const application = buildApplication({ ApplicationClass: DiscoveringApplication });

    await application.initialize();

    expect(application.isBound({ key: 'services.DiscoveredService' })).toBe(false);
  });

  test('the flag alone registers every discovered class', async () => {
    const application = buildApplication({
      ApplicationClass: DiscoveringApplication,
      configs: { discoverArtifacts: true },
    });

    await application.initialize();

    expect(application.isBound({ key: 'services.DiscoveredService' })).toBe(true);
  });

  /** A library still exports an index, and an application discovers its own classes beside it. */
  test('both together register the union, and a class named twice registers once', async () => {
    const application = buildApplication({
      ApplicationClass: DiscoveringApplication,
      configs: {
        discoverArtifacts: true,
        artifacts: { services: [DeclaredOnlyService, DiscoveredService] },
        bootChecks: { binding: { doVerify: false, allowManual: true, allowOverride: false } },
      },
    });

    await application.initialize();

    expect(application.isBound({ key: 'services.DeclaredOnlyService' })).toBe(true);
    expect(application.isBound({ key: 'services.DiscoveredService' })).toBe(true);
  });
});

describe('the registry records what the decorators saw', () => {
  test('every decorated class is on the discovered list, in decoration order', () => {
    const discovered = MetadataRegistry.getInstance().getDiscoveredArtifacts();

    expect(discovered).toContain(DiscoveredService);
    expect(discovered).toContain(DiscoveredComponent);
    expect(discovered).toContain(DiscoveredModel);
    expect(discovered.indexOf(DiscoveredService)).toBeLessThan(
      discovered.indexOf(DiscoveredComponent),
    );
  });
});
