import { AbstractApplication, RestApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import { CoreBindings } from '@/common/bindings';
import { Container } from '@/helpers/inversion/container';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

/** What `AbstractApplication` is allowed to own: container, config and lifecycle-hook plumbing, and nothing that needs a router, a server or a host. */
const ABSTRACT_APPLICATION_MEMBERS = [
  'constructor',
  'executePostStartHooks',
  'executePostStopHooks',
  'getDefaultAsyncContextEnabled',
  'getProjectConfigs',
  'getProjectRoot',
  'init',
  'registerCoreBindings',
  'registerPostStartHook',
  'registerPostStopHook',
];

/** What moved DOWN onto `RestApplication` when the kernel was carved out - the router surface, every artifact registration, and the default middleware stack every host shares. */
const REST_APPLICATION_MEMBERS = [
  'buildErrorMiddleware',
  'component',
  'constructor',
  'controller',
  'dataSource',
  'drainByTag',
  'generateRequestId',
  'getRootRouter',
  'getServer',
  'initialize',
  'inspectRoutes',
  'registerComponents',
  'registerControllers',
  'registerCoreBindings',
  'registerDataSources',
  'registerDefaultMiddlewares',
  'registerDynamicBindings',
  'repository',
  'service',
];

/** Members `@venizia/ignis`'s `ServerApplication` owns. A browser Worker extends `RestApplication`, so neither kernel layer may carry any of them - inherited counts as carrying. */
const SERVER_ONLY_MEMBERS = ['start', 'stop', 'getServerHost', 'getServerPort', 'getServerAddress'];

const ownMembersOf = (target: object): Array<string> => {
  return Object.getOwnPropertyNames(target).sort();
};

class ConcreteRestApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'kernel-rest-app', version: '0.0.0', description: 'Router-only kernel app' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

const buildConfigs = (opts?: Partial<IApplicationConfigs>): IApplicationConfigs => {
  return { host: '127.0.0.1', port: 0, path: { base: '/', isStrict: false }, ...opts };
};

/**
 * The split only pays for itself if the members really LEFT `AbstractApplication`. A test that
 * asserts a member is PRESENT cannot tell inherited from redeclared, so a regression that copied
 * the router surface back up would pass every arrival assertion while putting `OpenAPIHono` back
 * under every host that only wanted the container.
 */
describe('the kernel application layering - what left, not only what arrived', () => {
  test('RestApplication -> AbstractApplication -> Container, in that order', () => {
    expect(Object.getPrototypeOf(RestApplication)).toBe(AbstractApplication);
    expect(Object.getPrototypeOf(AbstractApplication)).toBe(Container);
  });

  test('AbstractApplication owns exactly the container, config and hook plumbing', () => {
    expect(ownMembersOf(AbstractApplication.prototype)).toEqual(ABSTRACT_APPLICATION_MEMBERS);
  });

  test('RestApplication owns exactly the router surface and the artifact registrations', () => {
    expect(ownMembersOf(RestApplication.prototype)).toEqual(REST_APPLICATION_MEMBERS);
  });

  test('the two sets overlap only where an override is the point', () => {
    const shared = ABSTRACT_APPLICATION_MEMBERS.filter(member =>
      REST_APPLICATION_MEMBERS.includes(member),
    );

    // `registerCoreBindings` is redeclared deliberately - RestApplication calls `super` and adds the
    // server and root-router bindings on top. Any other name appearing here is a member that was
    // copied down instead of moved.
    expect(shared).toEqual(['constructor', 'registerCoreBindings']);
  });

  test('neither kernel layer carries a server member, inherited or own', () => {
    for (const member of SERVER_ONLY_MEMBERS) {
      expect(member in AbstractApplication.prototype).toBe(false);
      expect(member in RestApplication.prototype).toBe(false);
    }
  });

  test('AbstractApplication carries no router accessor at all', () => {
    expect('getServer' in AbstractApplication.prototype).toBe(false);
    expect('getRootRouter' in AbstractApplication.prototype).toBe(false);
  });

  test('a concrete RestApplication still INHERITS everything AbstractApplication kept', () => {
    const application = new ConcreteRestApplication({
      scope: ConcreteRestApplication.name,
      config: buildConfigs(),
    });

    for (const member of ABSTRACT_APPLICATION_MEMBERS.filter(name => name !== 'constructor')) {
      expect(typeof (application as unknown as Record<string, unknown>)[member]).toBe('function');
    }

    // Two routers, never one: the root router is mounted under the base path, the server is not.
    expect(application.getServer()).not.toBe(application.getRootRouter());
  });

  test('RestApplication binds the server and the root router; AbstractApplication binds neither', () => {
    const application = new ConcreteRestApplication({
      scope: ConcreteRestApplication.name,
      config: buildConfigs(),
    });
    application.init();

    expect(application.get<unknown>({ key: CoreBindings.APPLICATION_SERVER })).toBeDefined();
    expect(application.get<unknown>({ key: CoreBindings.APPLICATION_ROOT_ROUTER })).toBe(
      application.getRootRouter(),
    );
    expect(application.get<unknown>({ key: CoreBindings.APPLICATION_INSTANCE })).toBe(application);
  });
});
