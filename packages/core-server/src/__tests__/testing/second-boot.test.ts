// Import order guard: see route-registration.test.ts.
import '@/base/applications';

import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs } from '@/base/applications';
import { ApplicationBootAssertion } from '@/testing';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  AuthorizationEnforcerRegistry,
  AuthorizationEnforcerTypes,
  AuthorizeBindingKeys,
  Container,
  type IApplicationInfo,
} from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import { TestAuthorizationEnforcer } from '../authorize/helpers';

/** An application that registers an enforcer by name, as an application with Casbin does in `preConfigure()`. */
class EnforcerApplication extends BaseApplication {
  constructor() {
    super({
      scope: 'EnforcerApplication',
      config: {
        host: '127.0.0.1',
        port: 0,
        path: { base: '/', isStrict: false },
      } as IApplicationConfigs,
    });
  }

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'enforcer-app', version: '0.0.0', description: '' };
  }

  staticConfigure(): void {}

  preConfigure(): void {
    this.bind<{ defaultDecision: 'deny' }>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
      defaultDecision: 'deny',
    });

    AuthorizationEnforcerRegistry.getInstance().register({
      container: this,
      enforcers: [
        {
          enforcer: TestAuthorizationEnforcer,
          name: 'casbin',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });
  }

  postConfigure(): void {}
  setupMiddlewares(): void {}
}

describe('ApplicationBootAssertion owns the enforcer registry while it boots (#935)', () => {
  test('both boots succeed with no reset of the enforcer registry in between', async () => {
    const boot = () =>
      ApplicationBootAssertion.assert({
        application: () => new EnforcerApplication(),
        options: { allowNoControllers: true },
      });

    const first = await boot();
    const second = await boot();

    expect(second).not.toBe(first);
    expect(AuthorizationEnforcerRegistry.getInstance().getNames()).toEqual(['casbin']);
  });

  test('a boot starts from an empty registry: a name left by earlier code does not collide', async () => {
    AuthorizationEnforcerRegistry.getInstance().reset();

    AuthorizationEnforcerRegistry.getInstance().register({
      container: new Container({ scope: 'left-behind' }),
      enforcers: [
        {
          enforcer: TestAuthorizationEnforcer,
          name: 'casbin',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    await ApplicationBootAssertion.assert({
      application: () => new EnforcerApplication(),
      options: { allowNoControllers: true },
    });

    expect(AuthorizationEnforcerRegistry.getInstance().getNames()).toEqual(['casbin']);
  });

  test('application code registering the same name twice is still refused', () => {
    AuthorizationEnforcerRegistry.getInstance().reset();

    const container = new Container({ scope: 'app-code' });
    const register = () =>
      AuthorizationEnforcerRegistry.getInstance().register({
        container,
        enforcers: [
          {
            enforcer: TestAuthorizationEnforcer,
            name: 'casbin',
            type: AuthorizationEnforcerTypes.CUSTOM,
          },
        ],
      });

    register();

    expect(register).toThrow(/Enforcer already registered: casbin/);
  });
});
