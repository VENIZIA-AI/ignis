// Import order guard: see route-registration.test.ts.
import '@/base/applications';

import { BaseApplication } from '@/base/applications';
import { ServerBootSteps } from '@/base/applications';
import type { IApplicationConfigs } from '@/base/applications';
import { BaseRestController } from '@/base/controllers';
import { controller, get, inject, model, repository, service } from '@/base/metadata';
import { assertApplicationBoots } from '@/testing';
import { z } from '@hono/zod-openapi';
import {
  BasePostgresDataSource,
  BasePostgresEntity,
  DefaultCRUDRepository,
} from '@venizia/ignis-connectors/postgres';
import type { AnyType, TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import {
  BaseComponent,
  BindingNamespaces,
  CoreBindings,
  type IApplicationInfo,
  jsonResponse,
} from '@venizia/ignis-kernel';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';

const okResponse = jsonResponse({ schema: z.object({ hit: z.string() }), description: 'ok' });

const calls = { failing: 0, counting: 0, component: 0, hydrate: 0, rotatables: 0, override: 0 };

beforeEach(() => {
  for (const key of Object.keys(calls)) {
    calls[key as keyof typeof calls] = 0;
  }
});

/** Stands for a database nobody can reach: its `configure()` throws. */
class FailingDataSource extends BasePostgresDataSource<{}> {
  constructor() {
    super({ name: 'FailingDataSource', config: {}, schema: {} });
  }

  configure(): void {
    calls.failing += 1;
    throw new Error('REAL INFRA: cannot reach the database');
  }

  getConnectionString(): string {
    return 'postgres://nowhere';
  }
}

/** A datasource whose `configure()` only counts. */
class CountingDataSource extends BasePostgresDataSource<{}> {
  constructor() {
    super({ name: 'CountingDataSource', config: {}, schema: {} });
  }

  configure(): void {
    calls.counting += 1;
  }

  getConnectionString(): string {
    return 'postgres://counting';
  }
}

@model({ type: 'entity' })
class Account extends BasePostgresEntity<typeof Account.schema> {
  static override schema = pgTable('boot_probe_account', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }),
  });
}

@repository({ model: Account, dataSource: FailingDataSource })
class AccountRepository extends DefaultCRUDRepository<typeof Account.schema> {}

@service()
class AccountService {
  constructor(
    @inject({ key: 'repositories.AccountRepository' })
    readonly accountRepository: AccountRepository,
  ) {}
}

@controller({ path: '/accounts' })
class AccountController extends BaseRestController {
  constructor(@inject({ key: 'services.AccountService' }) readonly accounts: AccountService) {
    super({ scope: AccountController.name });
  }

  override binding(): ValueOrPromise<void> {}

  @get({ configs: { path: '/', responses: okResponse } })
  list(context: AnyType) {
    return context.json({ hit: 'list' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

/** The incident: the class lost its `@service()`, so nothing registers it. */
class DetachedService {}

@controller({ path: '/broken' })
class BrokenController extends BaseRestController {
  constructor(@inject({ key: 'services.DetachedService' }) readonly detached: DetachedService) {
    super({ scope: BrokenController.name });
  }

  override binding(): ValueOrPromise<void> {}
}

/** Registered, but its dependency never was; no controller references it. */
@service()
class OrphanService {
  constructor(@inject({ key: 'services.NeverRegistered' }) readonly missing: unknown) {}
}

@controller({ path: '/dup' })
class FirstDuplicateController extends BaseRestController {
  constructor() {
    super({ scope: FirstDuplicateController.name });
  }

  override binding(): ValueOrPromise<void> {}

  @get({ configs: { path: '/users/:id', responses: okResponse } })
  one(context: AnyType) {
    return context.json({ hit: 'first' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

@controller({ path: '/dup' })
class SecondDuplicateController extends BaseRestController {
  constructor() {
    super({ scope: SecondDuplicateController.name });
  }

  override binding(): ValueOrPromise<void> {}

  @get({ configs: { path: '/users/:userId', responses: okResponse } })
  one(context: AnyType) {
    return context.json({ hit: 'second' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

/** A component that needs infrastructure: its `binding()` only counts. */
class CountingComponent extends BaseComponent {
  constructor(@inject({ key: CoreBindings.APPLICATION_INSTANCE }) application: BaseApplication) {
    super({ scope: CountingComponent.name, initDefault: { enable: true, container: application } });
  }

  override binding(): ValueOrPromise<void> {
    calls.component += 1;
  }
}

/** A component that contributes a datasource while it binds. */
class ContributingComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: ContributingComponent.name,
      initDefault: { enable: true, container: application },
    });
  }

  override binding(): ValueOrPromise<void> {
    this.application.dataSource(CountingDataSource);
  }
}

interface IPlan {
  dataSources?: Array<TClass<AnyType>>;
  repositories?: Array<TClass<AnyType>>;
  services?: Array<TClass<AnyType>>;
  controllers?: Array<TClass<AnyType>>;
  components?: Array<TClass<AnyType>>;
  config?: Partial<IApplicationConfigs>;
}

class PlannedApplication extends BaseApplication {
  constructor(readonly plan: IPlan) {
    super({
      scope: 'PlannedApplication',
      config: {
        host: '127.0.0.1',
        port: 0,
        path: { base: '/', isStrict: false },
        ...plan.config,
      } as IApplicationConfigs,
    });
  }

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'planned', version: '0.0.0', description: '' };
  }

  staticConfigure(): void {}

  preConfigure(): void {
    this.plan.dataSources?.forEach((target) => this.dataSource(target));
    this.plan.repositories?.forEach((target) => this.repository(target));
    this.plan.services?.forEach((target) => this.service(target));
    this.plan.components?.forEach((target) => this.component(target));
    this.plan.controllers?.forEach((target) => this.controller(target));
  }

  postConfigure(): void {}
  setupMiddlewares(): void {}

  override async hydrateSecrets(): Promise<void> {
    calls.hydrate += 1;
  }

  override async wireSecretRotatables(): Promise<void> {
    calls.rotatables += 1;
  }
}

const FULL: IPlan = {
  dataSources: [FailingDataSource],
  repositories: [AccountRepository],
  services: [AccountService],
  controllers: [AccountController],
};

describe('assertApplicationBoots - the boot path', () => {
  test('C1/C2 an unregistered injection is rejected with the very error boot raises', async () => {
    const application = new PlannedApplication({ controllers: [BrokenController] });
    const boot = application.initialize.bind(application);
    application.init();
    const original = await boot().catch((error: unknown) => error);

    const fresh = new PlannedApplication({ controllers: [BrokenController] });
    const error = await assertApplicationBoots(fresh).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain(
      'Binding key: services.DetachedService is not bounded in context!',
    );
    expect(String(error)).toBe(String(original));
  });

  test('C2 the rejection is the original Error object, not a wrapper', async () => {
    const application = new PlannedApplication({ controllers: [BrokenController] });
    const seen: unknown[] = [];
    const original = application.initialize.bind(application);
    application.initialize = async () => {
      try {
        await original();
      } catch (error) {
        seen.push(error);
        throw error;
      }
    };

    const error = await assertApplicationBoots(application).catch((caught: unknown) => caught);

    expect(seen).toHaveLength(1);
    expect(error).toBe(seen[0]);
  });

  test('C3 a correct application resolves with that same application', async () => {
    const application = new PlannedApplication(FULL);

    expect(await assertApplicationBoots(application)).toBe(application);
  });

  test('C3 a factory is accepted, sync or async', async () => {
    const sync = await assertApplicationBoots(() => new PlannedApplication(FULL));
    const asynchronous = await assertApplicationBoots(async () => new PlannedApplication(FULL));

    expect(sync).toBeInstanceOf(PlannedApplication);
    expect(asynchronous).toBeInstanceOf(PlannedApplication);
  });

  test('C4 the routes of the controllers are mounted on the root router afterwards (start() mounts it on the server)', async () => {
    const application = await assertApplicationBoots(new PlannedApplication(FULL));

    const response = await application.getRootRouter().request('/accounts/');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hit: 'list' });
  });

  test('C5 a service injecting an unregistered key fails even though no controller references it', async () => {
    const error = await assertApplicationBoots(
      new PlannedApplication({ ...FULL, services: [AccountService, OrphanService] }),
    ).catch((caught: unknown) => caught);

    expect(String(error)).toContain('services.NeverRegistered');
  });

  test('C6 verifyBindings: false lets it through, whatever the application config says', async () => {
    const application = new PlannedApplication({
      ...FULL,
      services: [AccountService, OrphanService],
      config: {
        bootChecks: { binding: { doVerify: true, allowManual: true, allowOverride: true } },
      },
    });

    const booted = await assertApplicationBoots(application, { verifyBindings: false });

    expect(booted).toBe(application);
  });
});

describe('assertApplicationBoots - the shared verification core', () => {
  const ORPHANED: IPlan = { ...FULL, services: [AccountService, OrphanService] };

  test('I3 the rejection is the core error: it says what is missing and who needs it', async () => {
    const error = await assertApplicationBoots(new PlannedApplication(ORPHANED)).catch(
      (caught: unknown) => caught,
    );

    expect(String(error)).toContain('[verifyBindings] 1 binding(s) cannot be resolved | ');
    expect(Reflect.get(Object(error), 'extra')).toMatchObject({
      missing: { 'services.NeverRegistered': ['services.OrphanService'] },
    });
  });

  test('I4 skipBindings leaves the service out, by class, by class name and by key', async () => {
    for (const skip of [OrphanService, 'OrphanService', 'services.OrphanService']) {
      const application = new PlannedApplication(ORPHANED);

      expect(await assertApplicationBoots(application, { skipBindings: [skip] })).toBe(application);
    }
  });

  test('I5 a skipBindings name that matches nothing rejects, naming it', async () => {
    const error = await assertApplicationBoots(new PlannedApplication(FULL), {
      skipBindings: ['services.Typo'],
    }).catch((caught: unknown) => caught);

    expect(String(error)).toContain('skip matched no binding: services.Typo');
  });

  test('I6 the application own doVerify: true does not fail the boot of a skipped binding', async () => {
    const application = new PlannedApplication({
      ...ORPHANED,
      config: {
        bootChecks: { binding: { doVerify: true, allowManual: true, allowOverride: true } },
      },
    });

    expect(await assertApplicationBoots(application, { skipBindings: [OrphanService] })).toBe(
      application,
    );
  });

  test('I6 verifyBindings: false skips the verification and a skipBindings name is then not checked', async () => {
    const application = new PlannedApplication(ORPHANED);

    expect(await assertApplicationBoots(application, { verifyBindings: false })).toBe(application);
  });

  test('I9 the verification runs after validateScopeFilterSupport, so its error comes first when both fail', async () => {
    class ScopeFilterFailingApplication extends PlannedApplication {
      protected override validateScopeFilterSupport(): void {
        throw new Error('SCOPE FILTER UNSUPPORTED');
      }
    }

    const error = await assertApplicationBoots(new ScopeFilterFailingApplication(ORPHANED)).catch(
      (caught: unknown) => caught,
    );

    expect(String(error)).toContain('SCOPE FILTER UNSUPPORTED');
  });
});

describe('assertApplicationBoots - datasources and components', () => {
  test('C7 positive control: a plain initialize() fails at the datasource', async () => {
    const application = new PlannedApplication(FULL);
    application.init();

    const error = await application.initialize().catch((caught: unknown) => caught);

    expect(String(error)).toContain('REAL INFRA');
  });

  test('C7 by default configure() is not called and the repository, service and controller resolve', async () => {
    const application = await assertApplicationBoots(new PlannedApplication(FULL));

    expect(calls.failing).toBe(0);
    expect(application.isBound({ key: 'repositories.AccountRepository' })).toBe(true);
    expect(application.get({ key: 'controllers.AccountController' })).toBeInstanceOf(
      AccountController,
    );
  });

  test.each([
    ['its class', () => FailingDataSource],
    ['its class name', () => 'FailingDataSource'],
    ['its binding key', () => 'datasources.FailingDataSource'],
  ])('C8 a datasource kept by %s runs its real configure()', async (_form, target) => {
    const error = await assertApplicationBoots(new PlannedApplication(FULL), {
      keepDataSources: [target()],
    }).catch((caught: unknown) => caught);

    expect(String(error)).toContain('REAL INFRA');
    expect(calls.failing).toBe(1);
  });

  test('C8 keeping one datasource leaves the others skipped', async () => {
    await assertApplicationBoots(
      new PlannedApplication({ ...FULL, dataSources: [FailingDataSource, CountingDataSource] }),
      { keepDataSources: [CountingDataSource] },
    );

    expect(calls.counting).toBe(1);
    expect(calls.failing).toBe(0);
  });

  test('C9 a datasource a component contributes is skipped by default too', async () => {
    await assertApplicationBoots(
      new PlannedApplication({ ...FULL, components: [ContributingComponent] }),
    );

    expect(calls.counting).toBe(0);
  });

  test('C10 a component named in skipComponents is not configured', async () => {
    await assertApplicationBoots(
      new PlannedApplication({ ...FULL, components: [CountingComponent] }),
      {
        skipComponents: [CountingComponent],
      },
    );

    expect(calls.component).toBe(0);
  });

  test('C11 a component that is not named is configured as in a real boot', async () => {
    await assertApplicationBoots(
      new PlannedApplication({ ...FULL, components: [CountingComponent] }),
    );

    expect(calls.component).toBe(1);
  });

  test('C12 an application override of registerDynamicBindings still runs, and the skip still applies', async () => {
    class OverridingApplication extends PlannedApplication {
      protected override async registerDynamicBindings(
        opts: Parameters<PlannedApplication['registerDynamicBindings']>[0],
      ): Promise<void> {
        calls.override += 1;
        return super.registerDynamicBindings(opts);
      }
    }

    await assertApplicationBoots(new OverridingApplication(FULL));

    expect(calls.override).toBeGreaterThan(0);
    expect(calls.failing).toBe(0);
  });
});

describe('assertApplicationBoots - steps and secrets', () => {
  test('C13 without skipSteps the two secrets steps do not run', async () => {
    await assertApplicationBoots(new PlannedApplication(FULL));

    expect(calls.hydrate).toBe(0);
    expect(calls.rotatables).toBe(0);
  });

  test('C14 skipSteps replaces the default: only the named step is skipped', async () => {
    await assertApplicationBoots(new PlannedApplication(FULL), {
      skipSteps: [ServerBootSteps.WIRE_SECRET_ROTATABLES],
    });

    expect(calls.hydrate).toBe(1);
    expect(calls.rotatables).toBe(0);
  });

  test('C15 an unknown step name rejects before anything boots', async () => {
    const application = new PlannedApplication(FULL);

    const error = await assertApplicationBoots(application, {
      skipSteps: ['notAStep' as never],
    }).catch((caught: unknown) => caught);

    expect(String(error)).toContain("Unknown boot step in skipSteps: 'notAStep'");
    expect(application.isBound({ key: CoreBindings.APPLICATION_INSTANCE })).toBe(false);
  });
});

describe('assertApplicationBoots - guards', () => {
  test('C16 the same instance a second time is refused, also after a failed first call', async () => {
    const good = new PlannedApplication(FULL);
    await assertApplicationBoots(good);
    const bad = new PlannedApplication({ controllers: [BrokenController] });
    await assertApplicationBoots(bad).catch(() => {});

    for (const application of [good, bad]) {
      const error = await assertApplicationBoots(application).catch((caught: unknown) => caught);

      expect(String(error)).toContain('already booted');
    }
  });

  test('C17 an application booted outside the helper is refused too', async () => {
    const application = new PlannedApplication(FULL);
    application.init();
    await application.initialize().catch(() => {});

    const error = await assertApplicationBoots(application).catch((caught: unknown) => caught);

    expect(String(error)).toContain('already booted');
  });

  test('C18 an application with no controller is rejected', async () => {
    const error = await assertApplicationBoots(
      new PlannedApplication({ dataSources: [FailingDataSource] }),
    ).catch((caught: unknown) => caught);

    expect(String(error)).toContain('registered no controller');
  });

  test('C19 allowNoControllers lets it through', async () => {
    const application = new PlannedApplication({ dataSources: [FailingDataSource] });

    const booted = await assertApplicationBoots(application, { allowNoControllers: true });

    expect(booted).toBe(application);
  });

  test('C20 everything it replaced is the original again, after a pass and after a failure', async () => {
    const original = {
      register: PlannedApplication.prototype['registerDynamicBindings' as never],
      sequence: PlannedApplication.prototype['getBootSequence' as never],
    };
    const passed = new PlannedApplication(FULL);
    const failed = new PlannedApplication({ controllers: [BrokenController] });
    const configureBefore = FailingDataSource.prototype.configure;

    await assertApplicationBoots(passed);
    await assertApplicationBoots(failed).catch(() => {});

    for (const application of [passed, failed]) {
      expect(Object.hasOwn(application, 'registerDynamicBindings')).toBe(false);
      expect(Object.hasOwn(application, 'getBootSequence')).toBe(false);
      expect(application['registerDynamicBindings' as never]).toBe(original.register);
      expect(application['getBootSequence' as never]).toBe(original.sequence);
      expect(application['configs'].bootChecks).toBeUndefined();
    }
    expect(FailingDataSource.prototype.configure).toBe(configureBefore);
    const dataSource = passed.get<FailingDataSource>({ key: 'datasources.FailingDataSource' });
    expect(Object.hasOwn(dataSource, 'configure')).toBe(false);
  });

  test('C21 a kernel method that is missing makes it refuse instead of booting', async () => {
    const application = new PlannedApplication(FULL);
    Object.defineProperty(application, 'registerDynamicBindings', { value: undefined });

    const error = await assertApplicationBoots(application).catch((caught: unknown) => caught);

    expect(String(error)).toContain("kernel method 'registerDynamicBindings' is missing");
    expect(calls.failing).toBe(0);
  });
});

describe("assertApplicationBoots - duplicate routes (the helper's own check)", () => {
  const DUPLICATES: IPlan = { controllers: [FirstDuplicateController, SecondDuplicateController] };

  test('C27 the same method and path mounted twice rejects, naming both controllers', async () => {
    const error = await assertApplicationBoots(new PlannedApplication(DUPLICATES)).catch(
      (caught: unknown) => caught,
    );

    expect(String(error)).toContain('GET /dup/users/:param');
    expect(String(error)).toContain('controllers.FirstDuplicateController');
    expect(String(error)).toContain('controllers.SecondDuplicateController');
    expect(String(error)).toContain('pass { routes: false }');
  });

  test('C27 routes: false turns the check off', async () => {
    const application = new PlannedApplication(DUPLICATES);

    const booted = await assertApplicationBoots(application, { routes: false });

    expect(booted).toBe(application);
  });

  test('C27 distinct paths on one controller are not duplicates', async () => {
    const booted = await assertApplicationBoots(new PlannedApplication(FULL));

    expect(booted).toBeInstanceOf(PlannedApplication);
  });
});

describe('assertApplicationBoots - what it never does', () => {
  test('A1 it never calls start(), never listens and never configures what is skipped', async () => {
    const application = new PlannedApplication({ ...FULL, components: [CountingComponent] });
    const start = spyOn(application, 'start');
    const serve = spyOn(Bun, 'serve');

    await assertApplicationBoots(application, { skipComponents: [CountingComponent] });

    expect(start).not.toHaveBeenCalled();
    expect(serve).not.toHaveBeenCalled();
    expect(application.getServerInstance()).toBeUndefined();
    expect(calls.failing).toBe(0);
    expect(calls.component).toBe(0);
    serve.mockRestore();
  });

  test('A1 BindingNamespaces are the tags the helper reads: controllers exist after a boot', async () => {
    const application = await assertApplicationBoots(new PlannedApplication(FULL));

    expect(application.findByTag({ tag: BindingNamespaces.CONTROLLER }).length).toBeGreaterThan(0);
  });
});
