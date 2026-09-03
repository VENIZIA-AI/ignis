import { AbstractApplication, RestApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import { CoreBindings } from '@/common/bindings';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

/** The methods `AbstractApplication` leaves inert and `@venizia/ignis`'s `ServerApplication` overrides. A browser Worker has no `process` and no working directory, so each one is a seam rather than a value. */
const HOST_SEAMS = ['getProjectRoot', 'getDefaultAsyncContextEnabled'];

/** No `host`/`port` seam any more: address resolution belongs to the layer that binds a socket - see `server-address.test.ts` in `@venizia/ignis`. */
const RETIRED_SEAMS = ['getEnvServerHost', 'getEnvServerPort'];

class KernelApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'kernel-seams-app', version: '0.0.0', description: 'Host seam probe' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

/** Stands in for `ServerApplication`: it overrides exactly the seams, which is the whole contract this test exists to hold. */
class HostedApplication extends KernelApplication {
  protected override getDefaultAsyncContextEnabled(): boolean {
    return true;
  }

  override getProjectRoot(): string {
    const projectRoot = '/srv/app';
    this.bind<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT }).toValue(projectRoot);
    return projectRoot;
  }
}

const buildConfigs = (opts?: Partial<IApplicationConfigs>): IApplicationConfigs => {
  return { path: { base: '/', isStrict: false }, ...opts } as IApplicationConfigs;
};

const buildApplication = (opts?: Partial<IApplicationConfigs>): KernelApplication => {
  return new KernelApplication({
    scope: KernelApplication.name,
    config: buildConfigs(opts),
  });
};

/**
 * These are the entire reason the kernel can be browser-pure: everything that needs a `process`, a
 * working directory or an environment is a method left empty here and overridden in
 * `@venizia/ignis`. A regression that inlined any of them - reading a literal `undefined` at the
 * call site instead of calling the method - would keep the kernel green, keep `make purity` green,
 * and silently disable the server override with no error at any layer.
 */
describe('the host seams the kernel leaves inert', () => {
  test('each is declared on AbstractApplication itself, so an override has something to override', () => {
    for (const seam of HOST_SEAMS) {
      expect(Object.getOwnPropertyNames(AbstractApplication.prototype)).toContain(seam);
      expect(Object.getOwnPropertyNames(RestApplication.prototype)).not.toContain(seam);
    }
  });

  test('the kernel answers are inert: no root, no async context', () => {
    const application = buildApplication();
    const reachable = application as unknown as Record<string, () => unknown>;

    expect(reachable.getProjectRoot()).toBe('');
    expect(reachable.getDefaultAsyncContextEnabled()).toBe(false);
  });

  test('getProjectRoot binds the root it returns, so a consumer of the binding sees the same value', () => {
    const application = buildApplication();

    expect(application.get<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT })).toBe('');

    const hosted = new HostedApplication({
      scope: HostedApplication.name,
      config: buildConfigs(),
    });
    expect(hosted.get<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT })).toBe('/srv/app');
  });

  /** The one assertion that proves these are seams rather than constants: the SAME constructor produces different config once a subclass overrides them. */
  test('an overriding subclass changes the resolved config, which is how the server layer works', () => {
    const hosted = new HostedApplication({
      scope: HostedApplication.name,
      config: buildConfigs(),
    });

    expect(hosted.getProjectConfigs().asyncContext?.enable).toBe(true);
  });

  test('an explicit config still wins over the seam', () => {
    const hosted = new HostedApplication({
      scope: HostedApplication.name,
      config: buildConfigs({ asyncContext: { enable: false } }),
    });

    expect(hosted.getProjectConfigs().asyncContext?.enable).toBe(false);
  });
});

/**
 * The kernel must not resolve an address at all. A browser Worker has no socket, and a kernel that
 * quietly wrote `localhost:3000` into its config made every Worker application look server-shaped
 * to anything reading `getProjectConfigs()`.
 */
describe('no address resolution left in the kernel', () => {
  test('neither env seam exists any more', () => {
    for (const seam of RETIRED_SEAMS) {
      expect(Object.getOwnPropertyNames(AbstractApplication.prototype)).not.toContain(seam);
      expect(Object.getOwnPropertyNames(RestApplication.prototype)).not.toContain(seam);
    }
  });

  test('an unconfigured application gets NO host and NO port, not a default pair', () => {
    const configs = buildApplication().getProjectConfigs() as Record<string, unknown>;

    expect(configs.host).toBeUndefined();
    expect(configs.port).toBeUndefined();
  });

  test('what the caller passed is carried through untouched, never re-resolved', () => {
    const configs = buildApplication({
      host: '127.0.0.1',
      port: 0,
    } as Partial<IApplicationConfigs>).getProjectConfigs() as Record<string, unknown>;

    // `0` in particular: the kernel does not even look at it, so it cannot turn it into 3000.
    expect(configs.host).toBe('127.0.0.1');
    expect(configs.port).toBe(0);
  });
});
