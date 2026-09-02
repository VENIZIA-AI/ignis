import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import { BindingNamespaces } from '@/common/bindings';
import { BindingScopes } from '@/helpers/inversion';
import { BaseComponent } from '@/base/components';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';
import { BootSequence, BootSteps } from '@/base/applications/boot-sequence';
import type { IBootSequenceStep } from '@/base/applications/boot-sequence';
import { RecordingLogger } from '../support/recording-logger';

const buildConfigs = (): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
});

/** Direct coverage of the utility itself: `insertAfter` has zero callers in the codebase besides
 * `BaseApplication.getBootSequence()`, and an off-by-one in the `slice` boundaries would otherwise
 * ship undetected in an exported public primitive. */
describe('BootSequence', () => {
  const buildSteps = (): IBootSequenceStep[] => [
    { name: 'a', run: () => {} },
    { name: 'b', run: () => {} },
    { name: 'c', run: () => {} },
  ];

  test('insertAfter places the new step immediately after the named target', () => {
    const steps = BootSequence.insertAfter({
      steps: buildSteps(),
      target: 'b',
      step: { name: 'x', run: () => {} },
    });

    expect(steps.map(step => step.name)).toEqual(['a', 'b', 'x', 'c']);
  });

  test('insertAfter on the last step still lands at the end', () => {
    const steps = BootSequence.insertAfter({
      steps: buildSteps(),
      target: 'c',
      step: { name: 'x', run: () => {} },
    });

    expect(steps.map(step => step.name)).toEqual(['a', 'b', 'c', 'x']);
  });

  test('an unknown target name throws instead of silently no-oping', () => {
    expect(() =>
      BootSequence.insertAfter({
        steps: buildSteps(),
        target: 'unknown',
        step: { name: 'x', run: () => {} },
      }),
    ).toThrow("Unknown step: 'unknown'");
  });

  test('a duplicated target name throws instead of splicing after the first match', () => {
    const steps = [...buildSteps(), { name: 'b', run: () => {} }];

    expect(() =>
      BootSequence.insertAfter({ steps, target: 'b', step: { name: 'x', run: () => {} } }),
    ).toThrow("Ambiguous step: 'b' appears 2 times");
  });

  test('BootSteps knows its own names and rejects a server-only one', () => {
    expect(BootSteps.SCHEME_SET.size).toBe(9);
    expect(BootSteps.isValid(BootSteps.REGISTER_CONTRIBUTED_DATA_SOURCES)).toBe(true);
    expect(BootSteps.isValid('hydrateSecrets')).toBe(false);
  });

  test('the input array is left untouched', () => {
    const original = buildSteps();
    BootSequence.insertAfter({ steps: original, target: 'a', step: { name: 'x', run: () => {} } });

    expect(original.map(step => step.name)).toEqual(['a', 'b', 'c']);
  });
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

    override async registerConfiguredArtifacts(): Promise<void> {
      this.order.push('registerArtifacts');
      await super.registerConfiguredArtifacts();
    }
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
      'registerArtifacts',
      'preConfigure',
      'registerDataSources',
      'registerComponents',
      'registerContributedDataSources',
      'registerControllers',
      'postConfigure',
    ]);
  });

  test('configs.artifacts is registered before preConfigure, so preConfigure can override it by hand', async () => {
    class Svc {}
    class SeesIt extends OrderApp {
      sawServiceInPreConfigure = false;

      override preConfigure(): void {
        this.sawServiceInPreConfigure = this.isBound({ key: `${BindingNamespaces.SERVICE}.Svc` });
        super.preConfigure();
      }
    }
    const app = new SeesIt({
      scope: SeesIt.name,
      config: { ...buildConfigs(), artifacts: { services: [Svc] } },
    });

    await app.initialize();

    expect(app.sawServiceInPreConfigure).toBe(true);
  });

  test('every step is logged by name with its duration, then one summary line', async () => {
    const app = new OrderApp({ scope: OrderApp.name, config: buildConfigs() });
    const logger = new RecordingLogger();
    app['logger'] = logger;

    await app.initialize();

    // executeWithPerformanceMeasure logs `[scope] DONE | description | Took` at debug; args[1] is the description.
    const completed = logger.calls
      .filter(call => call.level === 'debug' && call.message.includes('DONE'))
      .map(call => call.args[1]);
    expect(completed).toEqual([
      'Boot step 1/8 staticConfigure',
      'Boot step 2/8 registerArtifacts',
      'Boot step 3/8 preConfigure',
      'Boot step 4/8 registerDataSources',
      'Boot step 5/8 registerComponents',
      'Boot step 6/8 registerContributedDataSources',
      'Boot step 7/8 registerControllers',
      'Boot step 8/8 postConfigure',
    ]);

    const summary = logger.calls.find(
      call => call.level === 'info' && call.message.startsWith('Boot sequence complete'),
    );
    expect(summary?.args[0]).toBe(8);
    expect(summary?.args[2]).toBe(
      'staticConfigure -> registerArtifacts -> preConfigure -> registerDataSources -> registerComponents -> registerContributedDataSources -> registerControllers -> postConfigure',
    );
  });

  test('a throwing step rejects initialize() with that same error and names the step in the log', async () => {
    const boom = getError({ message: 'preConfigure exploded' });

    class BrokenApp extends OrderApp {
      override preConfigure(): void {
        throw boom;
      }
    }

    const app = new BrokenApp({ scope: BrokenApp.name, config: buildConfigs() });
    const logger = new RecordingLogger();
    app['logger'] = logger;

    const failure = await app.initialize().catch((error: unknown) => error);

    expect(failure).toBe(boom);
    expect(app.order).toEqual(['staticConfigure', 'registerArtifacts']);

    const failed = logger.calls.find(call => call.level === 'error');
    expect(failed?.message).toStartWith('Boot step failed');
    expect(failed?.args.slice(0, 3)).toEqual(['preConfigure', 3, 8]);
  });
});

describe('component nesting - arbitrary depth', () => {
  // Fixtures reach the owning application through a closure rather than `@inject`, so the test
  // exercises the drain loop alone and not the container's constructor injection.
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
