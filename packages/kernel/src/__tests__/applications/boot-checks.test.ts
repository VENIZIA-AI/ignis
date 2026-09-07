import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import { inject, service } from '@/base/metadata';
import { BindingNamespaces } from '@/common/bindings';
import type { TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

/** Runs the real boot sequence; only the server-only hooks are stubbed. */
class CheckedApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'boot-checks-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

@service()
class HealthyService {}

/** Depends on a key nothing binds - the shape of a made-up `@inject` key or a dependency a `when` excluded. */
@service()
class BrokenService {
  constructor(@inject({ key: 'services.Missing' }) readonly missing: unknown) {}
}

type TBindingChecks = NonNullable<NonNullable<IApplicationConfigs['bootChecks']>['binding']>;

/** The permissive baseline - the same behavior as no `binding` group at all - with one decision flipped per test. */
const buildBindingChecks = (overrides: Partial<TBindingChecks> = {}): TBindingChecks => ({
  doVerify: false,
  allowManual: true,
  allowOverride: true,
  ...overrides,
});

const buildConfigs = (overrides: Partial<IApplicationConfigs> = {}): IApplicationConfigs => ({
  path: { base: '/', isStrict: false },
  ...overrides,
});

const buildApplication = <ApplicationType extends CheckedApplication>(opts: {
  ApplicationClass: TClass<ApplicationType>;
  configs: IApplicationConfigs;
}) => {
  const application = new opts.ApplicationClass({
    scope: opts.ApplicationClass.name,
    config: opts.configs,
  });
  application.init();
  return application;
};

describe('bootChecks.binding.doVerify', () => {
  test('absent: a service with an unbound dependency still boots', async () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs({ artifacts: { services: [BrokenService] } }),
    });

    await application.initialize();
  });

  test('true: the boot fails and the error names the binding that could not be resolved', async () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs({
        artifacts: { services: [HealthyService, BrokenService] },
        bootChecks: { binding: buildBindingChecks({ doVerify: true }) },
      }),
    });

    const failure = await application.initialize().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('services.BrokenService');
    expect(String(failure)).toContain('services.Missing');
    expect(String(failure)).not.toContain('services.HealthyService');
  });

  test('true: a boot where every service and repository resolves passes', async () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs({
        artifacts: { services: [HealthyService] },
        bootChecks: { binding: buildBindingChecks({ doVerify: true }) },
      }),
    });

    await application.initialize();
    expect(application.get<HealthyService>({ key: 'services.HealthyService' })).toBeInstanceOf(
      HealthyService,
    );
  });
});

describe('bootChecks.binding.allowManual', () => {
  class MixingApplication extends CheckedApplication {
    override preConfigure(): void {
      this.service(HealthyService);
    }
  }

  test('false: a hand registration inside preConfigure fails the boot when configs.artifacts is set', async () => {
    const application = buildApplication({
      ApplicationClass: MixingApplication,
      configs: buildConfigs({
        artifacts: { services: [] },
        bootChecks: { binding: buildBindingChecks({ allowManual: false }) },
      }),
    });

    const failure = await application.initialize().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('HealthyService');
    expect(String(failure)).toContain('preConfigure');
    expect(String(failure)).toContain("'bootChecks.binding.allowManual' is false");
  });

  test('false: the same hand registration is allowed while configs.artifacts is absent', async () => {
    const application = buildApplication({
      ApplicationClass: MixingApplication,
      configs: buildConfigs({
        bootChecks: { binding: buildBindingChecks({ allowManual: false }) },
      }),
    });

    await application.initialize();
  });

  test('false: registrations made by the index itself are not manual', async () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs({
        artifacts: { services: [HealthyService] },
        bootChecks: { binding: buildBindingChecks({ allowManual: false, doVerify: true }) },
      }),
    });

    await application.initialize();
  });
});

describe('bootChecks.binding.allowOverride', () => {
  const sharedBinding = { namespace: BindingNamespaces.SERVICE, key: 'RunModeService' };

  /** Two classes behind one key - the run-mode pair whose second registration wins silently by default. */
  @service({ binding: sharedBinding })
  class PostgresRunModeService {}

  @service({ binding: sharedBinding })
  class ClickHouseRunModeService {}

  @service({ allowOverride: true })
  class ReplaceableService {}

  test('absent: a same-key re-registration overwrites silently', () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs(),
    });
    application.service(HealthyService);

    expect(() => application.service(HealthyService)).not.toThrow();
  });

  test('false: a same-key re-registration throws and the error names the key and the setting', () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs({
        bootChecks: { binding: buildBindingChecks({ allowOverride: false }) },
      }),
    });
    application.service(HealthyService);

    expect(() => application.service(HealthyService)).toThrow(
      "[service] Binding key already registered: 'services.HealthyService' | 'bootChecks.binding.allowOverride' is false",
    );
  });

  test('false: allowOverride: true at the call site still overrides', () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs({
        bootChecks: { binding: buildBindingChecks({ allowOverride: false }) },
      }),
    });
    application.service(HealthyService);

    expect(() => application.service(HealthyService, { allowOverride: true })).not.toThrow();
  });

  test('false: allowOverride: true on the decorator still overrides', () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs({
        bootChecks: { binding: buildBindingChecks({ allowOverride: false }) },
      }),
    });
    application.service(ReplaceableService);

    expect(() => application.service(ReplaceableService)).not.toThrow();
  });

  test('false: two index classes behind one custom key fail the boot on the shared key', async () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs({
        artifacts: { services: [PostgresRunModeService, ClickHouseRunModeService] },
        bootChecks: { binding: buildBindingChecks({ allowOverride: false }) },
      }),
    });

    const failure = await application.initialize().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain(
      "[service] Binding key already registered: 'services.RunModeService'",
    );
  });

  test('absent: the same two classes boot and the later one wins', async () => {
    const application = buildApplication({
      ApplicationClass: CheckedApplication,
      configs: buildConfigs({
        artifacts: { services: [PostgresRunModeService, ClickHouseRunModeService] },
      }),
    });

    await application.initialize();
    expect(
      application.get<ClickHouseRunModeService>({ key: 'services.RunModeService' }),
    ).toBeInstanceOf(ClickHouseRunModeService);
  });
});
