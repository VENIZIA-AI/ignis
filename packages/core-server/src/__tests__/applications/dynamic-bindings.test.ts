import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import { BindingNamespaces } from '@venizia/ignis-kernel';
import type { Binding } from '@venizia/ignis-kernel';
import type { IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { beforeEach, describe, expect, test } from 'bun:test';

class BareApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'bare-app', version: '0.0.0', description: 'Dynamic binding test app' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}

  /** `registerDynamicBindings` is protected; the tests drive it directly. */
  async runDynamicBindings(opts: {
    namespace: string;
    onBeforeConfigure?: (opts: { binding: Binding<IConfigurable> }) => Promise<void>;
    onAfterConfigure?: (opts: {
      binding: Binding<IConfigurable>;
      instance: IConfigurable;
    }) => Promise<void>;
  }): Promise<void> {
    return this['registerDynamicBindings'](opts as never);
  }

  isConfigured(opts: { namespace: string; key: string }): boolean {
    return this['registeredBindings'][opts.namespace]?.has(opts.key) ?? false;
  }
}

/** Minimal `IConfigurable` - `registerDynamicBindings` only ever calls `configure()`. */
const buildConfigurable = (opts: {
  name: string;
  order: string[];
  onConfigure?: () => ValueOrPromise<void>;
}): IConfigurable => {
  return {
    configure: async () => {
      opts.order.push(opts.name);
      await opts.onConfigure?.();
    },
  };
};

const CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

describe('BaseApplication - registerDynamicBindings', () => {
  let application: BareApplication;

  beforeEach(() => {
    application = new BareApplication({ scope: 'BareApplication', config: CONFIGS });
  });

  test('configures every binding in the namespace exactly once', async () => {
    const order: string[] = [];

    application
      .bind({ key: `${BindingNamespaces.COMPONENT}.Alpha` })
      .toValue(buildConfigurable({ name: 'Alpha', order }));
    application
      .bind({ key: `${BindingNamespaces.COMPONENT}.Beta` })
      .toValue(buildConfigurable({ name: 'Beta', order }));

    await application.runDynamicBindings({ namespace: BindingNamespaces.COMPONENT });

    expect(order.toSorted()).toEqual(['Alpha', 'Beta']);
  });

  test('a binding registered DURING configure() is picked up by the same pass', async () => {
    const order: string[] = [];

    application.bind({ key: `${BindingNamespaces.COMPONENT}.Parent` }).toValue(
      buildConfigurable({
        name: 'Parent',
        order,
        onConfigure: () => {
          application
            .bind({ key: `${BindingNamespaces.COMPONENT}.LateChild` })
            .toValue(buildConfigurable({ name: 'LateChild', order }));
        },
      }),
    );

    await application.runDynamicBindings({ namespace: BindingNamespaces.COMPONENT });

    expect(order).toEqual(['Parent', 'LateChild']);
  });

  test('a binding configured by a SIBLING mid-batch is not configured twice', async () => {
    const order: string[] = [];

    // The batch is drained before re-scanning, so `Sibling` is already queued when `Driver`
    // configures it by hand; the per-item guard is what keeps it from running twice.
    const sibling = buildConfigurable({ name: 'Sibling', order });

    // Driver bound FIRST so the loop reaches it while `Sibling` is still ahead of it in the batch.
    application.bind({ key: `${BindingNamespaces.COMPONENT}.Driver` }).toValue(
      buildConfigurable({
        name: 'Driver',
        order,
        onConfigure: async () => {
          await sibling.configure();
          application['registeredBindings'][BindingNamespaces.COMPONENT]?.add(
            `${BindingNamespaces.COMPONENT}.Sibling`,
          );
        },
      }),
    );

    application.bind({ key: `${BindingNamespaces.COMPONENT}.Sibling` }).toValue(sibling);

    await application.runDynamicBindings({ namespace: BindingNamespaces.COMPONENT });

    expect(order.filter(name => name === 'Sibling')).toHaveLength(1);
  });

  test('a second pass does NOT re-configure bindings already configured', async () => {
    const order: string[] = [];

    application
      .bind({ key: `${BindingNamespaces.COMPONENT}.Alpha` })
      .toValue(buildConfigurable({ name: 'Alpha', order }));

    await application.runDynamicBindings({ namespace: BindingNamespaces.COMPONENT });
    await application.runDynamicBindings({ namespace: BindingNamespaces.COMPONENT });

    expect(order).toEqual(['Alpha']);

    application
      .bind({ key: `${BindingNamespaces.COMPONENT}.Gamma` })
      .toValue(buildConfigurable({ name: 'Gamma', order }));

    await application.runDynamicBindings({ namespace: BindingNamespaces.COMPONENT });
    expect(order).toEqual(['Alpha', 'Gamma']);
  });

  // The after-hook must see its own binding as already configured: a hook that registers a sibling
  // and then asks "is mine done?" would otherwise re-enter it.
  test('onBeforeConfigure / onAfterConfigure fire around each binding, and the after-hook sees it configured', async () => {
    const order: string[] = [];
    const namespace = BindingNamespaces.COMPONENT;
    const key = `${namespace}.Alpha`;
    const mark = (): string =>
      application.isConfigured({ namespace, key }) ? 'configured' : 'pending';

    application.bind({ key }).toValue(buildConfigurable({ name: 'Alpha', order }));

    await application.runDynamicBindings({
      namespace,
      onBeforeConfigure: async ({ binding }) => {
        order.push(`before:${binding.key}:${mark()}`);
      },
      onAfterConfigure: async ({ binding, instance }) => {
        expect(typeof instance.configure).toBe('function');
        order.push(`after:${binding.key}:${mark()}`);
      },
    });

    expect(order).toEqual([`before:${key}:pending`, 'Alpha', `after:${key}:configured`]);
  });

  test('a throwing configure() propagates and leaves the binding unconfigured (retryable)', async () => {
    const order: string[] = [];
    let shouldFail = true;

    application.bind({ key: `${BindingNamespaces.COMPONENT}.Flaky` }).toValue(
      buildConfigurable({
        name: 'Flaky',
        order,
        onConfigure: () => {
          if (!shouldFail) {
            return;
          }

          throw getError({ message: 'configure exploded' });
        },
      }),
    );

    const failure = await application
      .runDynamicBindings({ namespace: BindingNamespaces.COMPONENT })
      .catch((error: unknown) => error);
    expect(String(failure)).toContain('configure exploded');

    shouldFail = false;
    await application.runDynamicBindings({ namespace: BindingNamespaces.COMPONENT });

    expect(order).toEqual(['Flaky', 'Flaky']);
  });
});
