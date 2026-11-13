import type { BaseApplication } from '@/base/applications';
import { ServerBootSteps, type TServerBootStep } from '@/base/applications';
import type { AnyType, TClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { BindingVerifier, isClass } from '@venizia/ignis-inversion';
import {
  type AbstractRestController,
  AuthorizationEnforcerRegistry,
  type Binding,
  BindingNamespaces,
  BindingValueTypes,
  ControllerTransports,
  CoreBindings,
  MetadataRegistry,
} from '@venizia/ignis-kernel';

/** A class (matched against the instance's constructor) or a string (matched against the binding key or the class name). */
export type TBootProbeTarget = TClass<unknown> | string;

/** Options of `ApplicationBootAssertion.assert`; each field narrows or relaxes what the boot probe runs and verifies. */
export interface IAssertApplicationBootsOptions {
  /**
   * Datasources whose real `configure()` runs. Every other datasource is bound and resolved but not
   * configured, so no connection is made. Close a kept one with `await application.stop()`.
   *
   * @default []
   */
  keepDataSources?: TBootProbeTarget[];

  /**
   * Components whose `configure()` (and so their `binding()`) is skipped, for the few that need
   * infrastructure. What a skipped component would have registered is not registered.
   *
   * @default []
   */
  skipComponents?: TBootProbeTarget[];

  /**
   * Boot steps that do not run, so a remote secrets provider is never contacted. A value REPLACES
   * the default; an unknown name rejects before anything boots.
   *
   * @default [ServerBootSteps.HYDRATE_SECRETS, ServerBootSteps.WIRE_SECRET_ROTATABLES]
   */
  skipSteps?: TServerBootStep[];

  /**
   * After boot, resolves every service and repository with the shared core of
   * `@venizia/ignis-inversion`, so an injection nobody references at boot still fails. An explicit value
   * wins over the application's own `bootChecks`, whose boot step is off for the run.
   *
   * @default true
   */
  verifyBindings?: boolean;

  /**
   * Services or repositories the verification leaves unresolved, for one whose constructor needs
   * infrastructure. A class (exact), a class name or a binding key. A name that matches nothing rejects.
   *
   * @default []
   */
  skipBindings?: TBootProbeTarget[];

  /**
   * Whether an application that registered no controller passes. Off, it fails: it proves nothing, for example when the artifact index was empty.
   *
   * @default false
   */
  allowNoControllers?: boolean;

  /**
   * This helper's own check that no method and path is mounted twice. IGNIS boot does not detect that.
   *
   * @default true
   */
  routes?: boolean;
}

/** The boot sequence is the contract; these two are what the helper wraps on one instance. */
const WRAPPED_METHODS = ['registerDynamicBindings', 'getBootSequence'] as const;

const DEFAULT_SKIPPED_STEPS: TServerBootStep[] = [
  ServerBootSteps.HYDRATE_SECRETS,
  ServerBootSteps.WIRE_SECRET_ROTATABLES,
];

/** Methods a route entry may carry that are middleware, not a mounted handler. */
const NON_ROUTE_METHOD = 'ALL';

const bootedApplications = new WeakSet<object>();

interface IProbeBinding {
  key: string;
}

interface IDynamicBindingsOptions {
  namespace: string;
  onBeforeConfigure?: (opts: { binding: Binding<AnyType> }) => Promise<void>;
  onAfterConfigure?: (opts: { binding: Binding<AnyType>; instance: AnyType }) => Promise<void>;
}

/** What the helper replaced, so every path puts it back. */
interface IPatch {
  restore: () => void;
}

const matchesTarget = (opts: {
  targets: TBootProbeTarget[];
  binding: IProbeBinding;
  instance: AnyType;
}): boolean => {
  const { targets, binding, instance } = opts;
  const className: string | undefined = instance?.constructor?.name;

  return targets.some((target) =>
    typeof target === 'string'
      ? target === binding.key || target === className
      : instance?.constructor === target,
  );
};

const fail = (message: string): never => {
  throw getError({ message: `[ApplicationBootAssertion.assert] ${message}` });
};

/** Replaces `object[name]` and returns the way back, even when `name` was inherited. */
const patchProperty = (opts: { object: AnyType; name: string; value: unknown }): IPatch => {
  const { object, name, value } = opts;
  const descriptor = Object.getOwnPropertyDescriptor(object, name);

  Object.defineProperty(object, name, { value, configurable: true, writable: true });

  return {
    restore: () => {
      if (descriptor) {
        Object.defineProperty(object, name, descriptor);

        return;
      }

      delete object[name];
    },
  };
};

const normalizePath = (path: string): string => {
  const withParams = path.replace(/:[A-Za-z0-9_]+/g, ':param').replace(/\/{2,}/g, '/');

  return withParams.length > 1 ? withParams.replace(/\/$/, '') : withParams;
};

/** The helper's own check: IGNIS mounts a method and path twice without complaint, and the first one wins. */
const assertNoDuplicateRoutes = (opts: { application: BaseApplication }): void => {
  const { application } = opts;
  // signature -> controller key -> how many times that controller declares it
  const mounted = new Map<string, Map<string, number>>();

  const record = (signature: string, key: string, declarations: number): void => {
    const owners = mounted.get(signature) ?? new Map<string, number>();
    owners.set(key, Math.max(owners.get(key) ?? 0, declarations));
    mounted.set(signature, owners);
  };

  for (const binding of application.findByTag<AbstractRestController>({
    tag: BindingNamespaces.CONTROLLER,
  })) {
    const target = binding.getBindingMeta({ type: BindingValueTypes.CLASS });
    const metadata = target
      ? MetadataRegistry.getInstance().getControllerMetadata({ target })
      : undefined;

    if (!metadata?.path || metadata.transport === ControllerTransports.GRPC) {
      continue;
    }

    // A bound controller is a class; this narrows it for the `prototype` read below.
    if (!isClass(target)) {
      continue;
    }

    const instance = application.get<AbstractRestController>({
      key: binding.key,
      isOptional: true,
    });

    // Hono's `routes` has one entry PER HANDLER (a validator, an authenticate and the handler of one route are three
    // entries with the same method and path), so an entry is not a declaration: a controller counts once per signature.
    for (const route of instance?.getRouter().routes ?? []) {
      if (route.method === NON_ROUTE_METHOD) {
        continue;
      }

      record(`${route.method} ${normalizePath(`${metadata.path}/${route.path}`)}`, binding.key, 1);
    }

    // What the router cannot show: one controller declaring a method and path twice. Decorated routes are one
    // metadata entry per declaration, so those are counted there.
    const declared = new Map<string, number>();

    for (const route of MetadataRegistry.getInstance()
      .getRoutes({ target: target.prototype })
      ?.values() ?? []) {
      const signature = `${String(route.method).toUpperCase()} ${normalizePath(`${metadata.path}/${route.path}`)}`;
      declared.set(signature, (declared.get(signature) ?? 0) + 1);
    }

    for (const [signature, declarations] of declared) {
      record(signature, binding.key, declarations);
    }
  }

  const duplicates = [...mounted.entries()].filter(
    ([, owners]) =>
      owners.size > 1 || [...owners.values()].some((declarations) => declarations > 1),
  );

  if (duplicates.length === 0) {
    return;
  }

  const lines = duplicates.map(
    ([signature, owners]) =>
      `${signature} | controllers: ${[...owners]
        .map(([key, declarations]) =>
          declarations > 1 ? `${key} (declared ${declarations} times)` : key,
        )
        .join(', ')}`,
  );
  fail(
    `${duplicates.length} route(s) are mounted more than once, and only the first one answers | ${lines.join(' ; ')} | This is the helper's own check (IGNIS boot does not detect it); pass { routes: false } to turn it off`,
  );
};

/**
 * Proves an IGNIS application boots, without a datasource connection, a socket or a secrets provider:
 * it runs the application's own boot sequence (`init()` then `initialize()`) and never calls `start()`,
 * so no socket is opened and no post-start hook runs.
 *
 * Datasources are bound and resolved but not configured, unless named in `keepDataSources`; the
 * secrets steps are skipped; every other step and every component runs as in a real boot. A component
 * that opens Redis, Kafka or S3 in `binding()` therefore runs for real: name it in `skipComponents`.
 * `setupMiddlewares()` is not run: it is the application's own start-time step, user code that may open
 * connections, and the probe cannot know it is free of side effects. The framework's default stack (CORS, body
 * limit, request id) is a boot step of `initialize()`, so an invalid `configs.middlewares` value still fails here.
 * When the boot fails inside a component, one warning names it; the rejection is still the original error. When the
 * boot fails, the rejection is the original error. The application stays booted and is returned;
 * a failed boot leaves a half-booted instance, so build a new one rather than reuse it.
 *
 * It wraps `registerDynamicBindings` and `getBootSequence` on THIS instance only (an application's
 * own override of either still runs) and restores them whatever happens.
 *
 * It owns the process-wide `AuthorizationEnforcerRegistry` for the duration of the check: it resets it before it
 * boots, so a second boot in the same process (another probe, or a test boot after this one) does not fail with
 * `Enforcer already registered`. An application still running in the same process loses its enforcer registrations
 * and its authorize options, so its requests are then decided by the no-enforcer default (deny unless configured
 * otherwise): do not run the probe in a process that serves an application.
 *
 * @example
 * ```typescript
 * import { ApplicationBootAssertion } from '@venizia/ignis/testing';
 * import { test } from 'bun:test';
 * import { Application } from './application';
 *
 * test('the application boots offline', async () => {
 *   await ApplicationBootAssertion.assert({
 *     application: () => new Application({ scope: 'Application', config: { host: '127.0.0.1', port: 0, path: { base: '/', isStrict: true } } }),
 *     options: { skipComponents: ['MailComponent'], allowNoControllers: true },
 *   });
 * });
 * ```
 */
export class ApplicationBootAssertion {
  static async assert<Application extends BaseApplication>(opts: {
    application: Application | (() => Application | Promise<Application>);
    options?: IAssertApplicationBootsOptions;
  }): Promise<Application> {
    const { application, options = {} } = opts;
    const {
      keepDataSources = [],
      skipComponents = [],
      skipSteps = DEFAULT_SKIPPED_STEPS,
      verifyBindings = true,
      skipBindings = [],
      allowNoControllers = false,
      routes = true,
    } = options;

    for (const step of skipSteps) {
      if (!ServerBootSteps.isValid(step)) {
        fail(
          `Unknown boot step in skipSteps: '${String(step)}' | Expected one of: ${[...ServerBootSteps.SCHEME_SET].join(', ')}`,
        );
      }
    }

    let target: Application;

    if (typeof application === 'function') {
      const built = await application();
      target = built;
    } else {
      target = application;
    }

    if (
      bootedApplications.has(target) ||
      Object.keys(target['registeredBindings'] ?? {}).length > 0
    ) {
      fail(
        `This application instance was already booted | A failed or finished boot leaves registrations behind, so build a new instance (pass a factory) for each call`,
      );
    }

    bootedApplications.add(target);

    for (const name of WRAPPED_METHODS) {
      if (typeof target[name] !== 'function') {
        fail(
          `The kernel method '${name}' is missing on this application | The helper cannot keep a boot offline without it, so it refuses to boot`,
        );
      }
    }

    const skippedSteps = new Set<string>(skipSteps);
    const patches: IPatch[] = [];
    let sweepsSeen = 0;
    // The components whose `configure()` is running, innermost last: when the boot rejects, the last one is where it failed.
    const configuringComponents: string[] = [];

    const neutralise = async (entry: {
      namespace: string;
      binding: Binding<AnyType>;
    }): Promise<void> => {
      const { namespace, binding } = entry;
      const isDataSource = namespace === BindingNamespaces.DATASOURCE;
      const isComponent = namespace === BindingNamespaces.COMPONENT;

      if (!isDataSource && !isComponent) {
        return;
      }

      const instance = target.get<AnyType>({ key: binding.key, isOptional: false });

      if (typeof instance?.configure !== 'function') {
        return;
      }

      const shouldRun = isDataSource
        ? matchesTarget({ targets: keepDataSources, binding, instance })
        : !matchesTarget({ targets: skipComponents, binding, instance });

      if (shouldRun) {
        return;
      }

      patches.push(patchProperty({ object: instance, name: 'configure', value: async () => {} }));
    };

    const originalRegisterDynamicBindings = target['registerDynamicBindings'] as unknown as (
      opts: IDynamicBindingsOptions,
    ) => Promise<void>;
    const originalGetBootSequence = target['getBootSequence'] as unknown as () => Array<{
      name: string;
    }>;

    const wrappedRegister = async (sweepOptions: IDynamicBindingsOptions): Promise<void> => {
      sweepsSeen += 1;
      const userBefore = sweepOptions.onBeforeConfigure;
      const userAfter = sweepOptions.onAfterConfigure;

      return originalRegisterDynamicBindings.call(target, {
        ...sweepOptions,
        onBeforeConfigure: async ({ binding }) => {
          await neutralise({ namespace: sweepOptions.namespace, binding });

          if (sweepOptions.namespace === BindingNamespaces.COMPONENT) {
            const instance = target.get<AnyType>({ key: binding.key, isOptional: true });
            configuringComponents.push(String(instance?.constructor?.name ?? binding.key));
          }

          await userBefore?.({ binding });
        },
        onAfterConfigure: async ({ binding, instance }) => {
          if (sweepOptions.namespace === BindingNamespaces.COMPONENT) {
            configuringComponents.pop();
          }

          await userAfter?.({ binding, instance });
        },
      });
    };

    patches.push(
      patchProperty({ object: target, name: 'registerDynamicBindings', value: wrappedRegister }),
    );
    patches.push(
      patchProperty({
        object: target,
        name: 'getBootSequence',
        value: () =>
          originalGetBootSequence.call(target).filter((step) => !skippedSteps.has(step.name)),
      }),
    );

    if ((target['registerDynamicBindings'] as unknown) !== wrappedRegister) {
      patches.forEach((patch) => patch.restore());
      fail(
        `The wrap of 'registerDynamicBindings' did not take effect | Refusing to boot against real infrastructure`,
      );
    }

    const configs = target['configs'];
    const originalBootChecks = configs.bootChecks;
    const originalBinding = originalBootChecks?.binding;
    configs.bootChecks = {
      ...originalBootChecks,
      binding: {
        allowManual: originalBinding?.allowManual ?? true,
        allowOverride: originalBinding?.allowOverride ?? true,
        doVerify: false,
      },
    };

    AuthorizationEnforcerRegistry.getInstance().reset();

    try {
      if (!target.isBound({ key: CoreBindings.APPLICATION_INSTANCE })) {
        target.init();
      }

      await target.initialize();

      const sweepsExpected = [
        ServerBootSteps.REGISTER_DATA_SOURCES,
        ServerBootSteps.REGISTER_COMPONENTS,
        ServerBootSteps.REGISTER_CONTRIBUTED_DATA_SOURCES,
      ].some((step) => !skippedSteps.has(step));

      if (sweepsExpected && sweepsSeen === 0) {
        fail(
          `The boot never went through 'registerDynamicBindings' | The wrap did not take effect, so datasources may have been configured`,
        );
      }

      if (verifyBindings) {
        BindingVerifier.assertResolve({
          container: target,
          namespaces: [BindingNamespaces.SERVICE, BindingNamespaces.REPOSITORY],
          skip: skipBindings,
          scope: 'verifyBindings',
        });
      }

      if (
        !allowNoControllers &&
        target.findByTag({ tag: BindingNamespaces.CONTROLLER }).length === 0
      ) {
        fail(
          `The application registered no controller | A boot that registers nothing proves nothing: check the artifact index (for example the AutoArtifacts plugin under 'bun test'), or pass { allowNoControllers: true }`,
        );
      }

      if (routes) {
        assertNoDuplicateRoutes({ application: target });
      }

      return target;
    } catch (error) {
      const failing = configuringComponents.at(-1);

      if (failing) {
        target.logger
          .for('ApplicationBootAssertion.assert')
          .warn(
            `The boot failed inside component ${failing} | If it needs infrastructure, skipComponents: ['${failing}'] skips it, and skipBindings lists the services that depend on it`,
          );
      }

      throw error;
    } finally {
      for (const patch of patches.reverse()) {
        patch.restore();
      }

      if (originalBootChecks === undefined) {
        delete configs.bootChecks;
      } else {
        configs.bootChecks = originalBootChecks;
      }
    }
  }
}
