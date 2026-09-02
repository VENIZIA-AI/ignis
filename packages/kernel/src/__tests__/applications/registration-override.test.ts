import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/types';
import { BaseComponent } from '@/base/components';
import { service } from '@/base/metadata';
import type { TMixinOpts } from '@/base/mixins/types';
import { BindingNamespaces } from '@/common/bindings';
import { BindingScopes, BindingValueTypes } from '@/helpers/inversion';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class ConcreteRestApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'registration-override-app', version: '0.0.0', description: '' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

class ProbeComponent extends BaseComponent {
  override binding(): ValueOrPromise<void> {}
}

class OtherProbeComponent extends BaseComponent {
  override binding(): ValueOrPromise<void> {}
}

/** The guard reads only the derived key, never the class shape, so one bare class stands in for every non-component artifact. */
class Probe {}

class OtherProbe {}

const buildConfigs = (): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
});

const buildApplication = (): ConcreteRestApplication => {
  return new ConcreteRestApplication({
    scope: ConcreteRestApplication.name,
    config: buildConfigs(),
  });
};

interface IRegistrationMethodCase {
  caller: string;
  key: string;
  register: (opts: { application: ConcreteRestApplication; options?: TMixinOpts }) => unknown;
}

/** One row per registration method. The guard is a per-method call, so a row per method is the only shape that notices when ONE of them drops it. */
const REGISTRATION_METHODS: IRegistrationMethodCase[] = [
  {
    caller: 'component',
    key: `${BindingNamespaces.COMPONENT}.${ProbeComponent.name}`,
    register: ({ application, options }) => application.component(ProbeComponent, options),
  },
  {
    caller: 'controller',
    key: `${BindingNamespaces.CONTROLLER}.${Probe.name}`,
    register: ({ application, options }) => application.controller(Probe, options),
  },
  {
    caller: 'service',
    key: `${BindingNamespaces.SERVICE}.${Probe.name}`,
    register: ({ application, options }) => application.service(Probe, options),
  },
  {
    caller: 'repository',
    key: `${BindingNamespaces.REPOSITORY}.${Probe.name}`,
    register: ({ application, options }) => application.repository(Probe as any, options),
  },
  {
    caller: 'dataSource',
    key: `${BindingNamespaces.DATASOURCE}.${Probe.name}`,
    register: ({ application, options }) => application.dataSource(Probe as any, options),
  },
];

describe('registration collision guard - allowOverride, on every registration method', () => {
  for (const { caller, key, register } of REGISTRATION_METHODS) {
    describe(`${caller}()`, () => {
      test('registering the same class twice does not throw by default (matches bind() overwrite behavior)', () => {
        const application = buildApplication();

        expect(() => register({ application })).not.toThrow();
        expect(() => register({ application })).not.toThrow();
      });

      test('a genuine collision under allowOverride: false throws, and the message names the method', () => {
        const application = buildApplication();
        register({ application });

        expect(() => register({ application, options: { allowOverride: false } })).toThrow(
          `[${caller}] Binding key already registered: '${key}'`,
        );
      });

      test('allowOverride: false does not throw when the key is not yet bound', () => {
        const application = buildApplication();

        expect(() => register({ application, options: { allowOverride: false } })).not.toThrow();
      });
    });
  }

  test('a distinct opts.binding key avoids the collision entirely, even under allowOverride: false', () => {
    const application = buildApplication();
    application.component(ProbeComponent);

    expect(() =>
      application.component(ProbeComponent, {
        binding: { namespace: BindingNamespaces.COMPONENT, key: 'ProbeComponentAlias' },
        allowOverride: false,
      }),
    ).not.toThrow();
  });
});

describe('controller() binds one instance per application', () => {
  test('two resolutions of a registered controller are the same instance', () => {
    const application = buildApplication();
    const key = `${BindingNamespaces.CONTROLLER}.${Probe.name}`;

    application.controller(Probe);

    expect(application.get({ key })).toBe(application.get({ key }));
    expect(application.getBinding({ key })?.getScope()).toBe(BindingScopes.SINGLETON);
  });
});

/** `allowOverride: true` (the default) promises that the LATER registration wins. Binding identity is what pins that: a container that handed back the first binding would still let `.toClass()` re-point it, so a value-only assertion cannot tell replace from reuse. */
describe('registration override - the second registration replaces the first', () => {
  test('service(): the key resolves to the later class, on a fresh binding with default scope', () => {
    const application = buildApplication();
    const key = `${BindingNamespaces.SERVICE}.${Probe.name}`;

    const first = application.service(Probe).setScope(BindingScopes.SINGLETON);
    const second = application.service(OtherProbe, {
      binding: { namespace: BindingNamespaces.SERVICE, key: Probe.name },
    });

    expect(second).not.toBe(first);
    expect(application.getBinding({ key })).toBe(second);
    expect(application.get({ key })).toBeInstanceOf(OtherProbe);
    // A fresh binding is TRANSIENT again - the first one's SINGLETON scope does not carry over.
    expect(application.get({ key })).not.toBe(application.get({ key }));
  });

  test('component(): the key points at the later class', () => {
    const application = buildApplication();
    const key = `${BindingNamespaces.COMPONENT}.${ProbeComponent.name}`;

    const first = application.component(ProbeComponent);
    const second = application.component(OtherProbeComponent, {
      binding: { namespace: BindingNamespaces.COMPONENT, key: ProbeComponent.name },
    });

    expect(second).not.toBe(first);
    expect(application.getBinding({ key })).toBe(second);
    expect(second.getBindingMeta({ type: BindingValueTypes.CLASS })).toBe(OtherProbeComponent);
  });
});

describe('registration reads the class decorator as its defaults', () => {
  test('@service({ scope: SINGLETON }) makes service() bind a singleton', () => {
    @service({ scope: BindingScopes.SINGLETON })
    class Cached {}
    const application = buildApplication();

    application.service(Cached);

    const key = `${BindingNamespaces.SERVICE}.${Cached.name}`;
    expect(application.getBinding({ key })?.getScope()).toBe(BindingScopes.SINGLETON);
    expect(application.get({ key })).toBe(application.get({ key }));
  });

  test('a decorator binding is the key when the call passes none; an explicit call-site binding wins', () => {
    @service({ binding: { namespace: BindingNamespaces.SERVICE, key: 'Aliased' } })
    class Named {}
    const application = buildApplication();

    application.service(Named);
    expect(application.isBound({ key: `${BindingNamespaces.SERVICE}.Aliased` })).toBe(true);

    application.service(Named, {
      binding: { namespace: BindingNamespaces.SERVICE, key: 'Explicit' },
    });
    expect(application.isBound({ key: `${BindingNamespaces.SERVICE}.Explicit` })).toBe(true);
  });

  test('allowOverride: false on the decorator makes a second registration throw; the call site can relax it', () => {
    @service({ allowOverride: false })
    class Strict {}
    const application = buildApplication();

    application.service(Strict);

    expect(() => application.service(Strict)).toThrow(
      `[service] Binding key already registered: '${BindingNamespaces.SERVICE}.${Strict.name}'`,
    );
    expect(() => application.service(Strict, { allowOverride: true })).not.toThrow();
  });

  test('a direct call ignores when - only registerArtifacts consults it', () => {
    @service({ when: () => false })
    class Conditional {}
    const application = buildApplication();

    application.service(Conditional);

    expect(application.isBound({ key: `${BindingNamespaces.SERVICE}.${Conditional.name}` })).toBe(
      true,
    );
  });

  test('an undecorated class keeps the defaults: derived key, TRANSIENT service, overwrite allowed', () => {
    const application = buildApplication();
    application.service(Probe);
    application.service(Probe);

    expect(
      application.getBinding({ key: `${BindingNamespaces.SERVICE}.${Probe.name}` })?.getScope(),
    ).toBe(BindingScopes.TRANSIENT);
  });
});
