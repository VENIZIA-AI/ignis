import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/types';
import { BaseComponent } from '@/base/components';
import type { IDataSource } from '@/base/datasources';
import { component, provide, service } from '@/base/metadata';
import type { IRepository } from '@/base/repositories';
import type { IService } from '@/base/services';
import { BindingNamespaces } from '@/common/bindings';
import { BindingScopes } from '@/helpers/inversion';
import type { TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { ProbeDataSource, ProbeRepository } from '../support/artifact-fixtures';

class RecordingApplication extends RestApplication {
  readonly calls: string[] = [];
  runMode = 'startup';

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'register-artifacts-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}

  override dataSource<Base extends IDataSource>(ctor: TClass<Base>) {
    this.calls.push(`dataSource:${ctor.name}`);
    return super.dataSource(ctor);
  }
  override component<Base extends BaseComponent>(ctor: TClass<Base>) {
    this.calls.push(`component:${ctor.name}`);
    return super.component(ctor);
  }
  override repository<Base extends IRepository>(ctor: TClass<Base>) {
    this.calls.push(`repository:${ctor.name}`);
    return super.repository(ctor);
  }
  override service<Base extends IService>(ctor: TClass<Base>) {
    this.calls.push(`service:${ctor.name}`);
    return super.service(ctor);
  }
  override controller<Base>(ctor: TClass<Base>) {
    this.calls.push(`controller:${ctor.name}`);
    return super.controller(ctor);
  }
}

const buildConfigs = (): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
});
const buildApplication = () =>
  new RecordingApplication({ scope: RecordingApplication.name, config: buildConfigs() });

class Cmp extends BaseComponent {
  constructor() {
    super({ scope: Cmp.name });
  }
  override binding(): ValueOrPromise<void> {}
}
class Svc {}
class Ctl {}

describe('RestApplication.registerArtifacts', () => {
  test('registers every kind in dependency order regardless of the order the index lists them', async () => {
    const application = buildApplication();

    await application.registerArtifacts({
      controllers: [Ctl],
      services: [Svc],
      repositories: [ProbeRepository],
      components: [Cmp],
      dataSources: [ProbeDataSource],
    });

    expect(application.calls).toEqual([
      'dataSource:ProbeDataSource',
      'component:Cmp',
      'repository:ProbeRepository',
      'service:Svc',
      'controller:Ctl',
    ]);
  });

  test('accepts nested arrays of indexes and registers them as one, in dependency order', async () => {
    const application = buildApplication();

    await application.registerArtifacts([
      [{ services: [Svc] }],
      { dataSources: [ProbeDataSource] },
      [{ controllers: [Ctl] }],
    ]);

    expect(application.calls).toEqual([
      'dataSource:ProbeDataSource',
      'service:Svc',
      'controller:Ctl',
    ]);
  });

  test('when: false skips the class; when reads the live application and may be async', async () => {
    @service<RecordingApplication>({
      when: ({ application }) => application.runMode !== 'migrate',
    })
    class OnlyOutsideMigrate {}
    @service<RecordingApplication>({
      when: async ({ application }) => application.runMode === 'migrate',
    })
    class OnlyInMigrate {}
    const application = buildApplication();
    application.runMode = 'migrate';

    await application.registerArtifacts({ services: [OnlyOutsideMigrate, OnlyInMigrate, Svc] });

    expect(application.calls).toEqual(['service:OnlyInMigrate', 'service:Svc']);
  });

  test('order sorts within a kind; ties keep index order', async () => {
    @service({ order: -1 })
    class First {}
    @service({ order: 10 })
    class Last {}
    class Middle {}
    class AlsoMiddle {}
    const application = buildApplication();

    await application.registerArtifacts({ services: [Last, Middle, AlsoMiddle, First] });

    expect(application.calls).toEqual([
      'service:First',
      'service:Middle',
      'service:AlsoMiddle',
      'service:Last',
    ]);
  });

  test('@provide methods on a component bind lazy providers before the next kind registers', async () => {
    @component()
    class OptionsComponent extends BaseComponent {
      static built = 0;

      constructor() {
        super({ scope: OptionsComponent.name });
      }

      @provide({ key: 'options.greeting' })
      greeting(): { text: string } {
        OptionsComponent.built += 1;
        return { text: 'hello' };
      }

      @provide({ key: 'options.stamp', scope: BindingScopes.TRANSIENT })
      stamp(): { at: number } {
        return { at: performance.now() };
      }

      override binding(): ValueOrPromise<void> {}
    }
    const application = buildApplication();

    await application.registerArtifacts({ components: [OptionsComponent] });

    expect(OptionsComponent.built).toBe(0);
    expect(application.get<{ text: string }>({ key: 'options.greeting' })).toEqual({
      text: 'hello',
    });
    expect(application.get<{ text: string }>({ key: 'options.greeting' })).toBe(
      application.get<{ text: string }>({ key: 'options.greeting' }),
    );
    expect(OptionsComponent.built).toBe(1);
    expect(application.get<{ at: number }>({ key: 'options.stamp' })).not.toBe(
      application.get<{ at: number }>({ key: 'options.stamp' }),
    );
  });

  test('a manual registration made before the index keeps its position', async () => {
    const application = buildApplication();
    class First {}
    class Second {}

    application.controller(First);
    await application.registerArtifacts({ controllers: [Second, First] });

    expect(
      application.findByTag({ tag: BindingNamespaces.CONTROLLER }).map(binding => binding.key),
    ).toEqual([`${BindingNamespaces.CONTROLLER}.First`, `${BindingNamespaces.CONTROLLER}.Second`]);
  });
});
