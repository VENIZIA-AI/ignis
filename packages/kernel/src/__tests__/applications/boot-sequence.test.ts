import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/types';
import { BindingNamespaces } from '@/common/bindings';
import { BindingScopes } from '@/helpers/inversion';
import { BaseComponent } from '@/base/components';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

const buildConfigs = (): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
});

describe('RestApplication boot sequence', () => {
  class OrderApp extends RestApplication {
    order: string[] = [];

    getAppInfo(): ValueOrPromise<IApplicationInfo> {
      return { name: 'boot-sequence-app', version: '0.0.0', description: '' };
    }

    staticConfigure(): void {
      this.order.push('staticConfigure');
    }
    preConfigure(): void {
      this.order.push('preConfigure');
    }
    postConfigure(): void {
      this.order.push('postConfigure');
    }
    setupMiddlewares(): void {}

    override async registerDataSources(): Promise<void> {
      this.order.push('registerDataSources');
    }
    override async registerComponents(): Promise<void> {
      this.order.push('registerComponents');
    }
    override async registerContributedDataSources(): Promise<void> {
      this.order.push('registerContributedDataSources');
    }
    override async registerControllers(): Promise<void> {
      this.order.push('registerControllers');
    }
  }

  test('runs every step once, in the declared order', async () => {
    const app = new OrderApp({ scope: OrderApp.name, config: buildConfigs() });

    await app.initialize();

    expect(app.order).toEqual([
      'staticConfigure',
      'preConfigure',
      'registerDataSources',
      'registerComponents',
      'registerContributedDataSources',
      'registerControllers',
      'postConfigure',
    ]);
  });
});

describe('component nesting - arbitrary depth', () => {
  // Bun's transpiler drops constructor-parameter decorators for this package's `tsconfig extends`
  // shape (see kernel gotchas), so `@inject(CoreBindings.APPLICATION_INSTANCE)` is not live here -
  // these fixtures reach the owning application via closure instead.
  let currentApp: RestApplication;

  class LeafComponent extends BaseComponent {
    static configured = false;

    constructor() {
      super({ scope: LeafComponent.name });
    }

    override binding(): ValueOrPromise<void> {
      currentApp
        .bind({ key: `${BindingNamespaces.DATASOURCE}.LeafDataSource` })
        .toValue({
          configure: async () => {
            LeafComponent.configured = true;
          },
        })
        .setScope(BindingScopes.SINGLETON);
    }
  }

  class MiddleComponent extends BaseComponent {
    constructor() {
      super({ scope: MiddleComponent.name });
    }

    override binding(): ValueOrPromise<void> {
      currentApp.component(LeafComponent);
    }
  }

  class RootComponent extends BaseComponent {
    constructor() {
      super({ scope: RootComponent.name });
    }

    override binding(): ValueOrPromise<void> {
      currentApp.component(MiddleComponent);
    }
  }

  class NestedApp extends RestApplication {
    getAppInfo(): ValueOrPromise<IApplicationInfo> {
      return { name: 'nested-component-app', version: '0.0.0', description: '' };
    }
    staticConfigure(): void {}
    preConfigure(): void {
      this.component(RootComponent);
    }
    postConfigure(): void {}
    setupMiddlewares(): void {}
    override async registerControllers(): Promise<void> {}
  }

  test('a datasource contributed three components deep is configured before initialize() returns', async () => {
    LeafComponent.configured = false;
    const app = new NestedApp({ scope: NestedApp.name, config: buildConfigs() });
    currentApp = app;

    await app.initialize();

    expect(LeafComponent.configured).toBe(true);
  });
});
