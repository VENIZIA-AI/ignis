import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import { AuthenticateComponent } from '@/components/auth/authenticate/component';
import { JoseLoader } from '@/components/auth/authenticate/services/jose-loader';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  AuthenticateBindingKeys,
  JOSEStandards,
  type IApplicationConfigs,
  type IApplicationInfo,
  type IServiceAuthOptions,
  type TBasicTokenServiceOptions,
  type TJWTTokenServiceOptions,
} from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';

const CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

const JWT_OPTIONS: TJWTTokenServiceOptions = {
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: 'probe-secret-that-is-long-enough-for-hs256',
    getTokenExpiresFn: () => 60,
  },
};

const SERVICE_OPTIONS: IServiceAuthOptions = {
  name: 'probe-service',
  resolvePrincipal: () => ({ userId: 'probe-service' }),
};

const BASIC_OPTIONS: TBasicTokenServiceOptions = {
  verifyCredentials: async () => null,
};

class AuthenticationApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'jose-load-app', version: '0.0.0', description: 'jose load failure probe' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}
}

const buildApplication = (opts: {
  jwtOptions?: TJWTTokenServiceOptions;
  serviceOptions?: IServiceAuthOptions;
  basicOptions?: TBasicTokenServiceOptions;
}): AuthenticationApplication => {
  const application = new AuthenticationApplication({
    scope: AuthenticationApplication.name,
    config: CONFIGS,
  });
  application.init();

  if (opts.jwtOptions) {
    application
      .bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
      .toValue(opts.jwtOptions);
  }

  if (opts.serviceOptions) {
    application
      .bind<IServiceAuthOptions>({ key: AuthenticateBindingKeys.SERVICE_OPTIONS })
      .toValue(opts.serviceOptions);
  }

  if (opts.basicOptions) {
    application
      .bind<TBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
      .toValue(opts.basicOptions);
  }

  application.component(AuthenticateComponent);
  return application;
};

const defaultImporter = JoseLoader['importer'];

/** Swaps how `jose` is imported, and drops a module another test file may already have loaded. */
const useImporter = (opts: { importer: typeof defaultImporter }): void => {
  JoseLoader['importer'] = opts.importer;
  JoseLoader['module'] = null;
};

const MISSING_JOSE = getError({ message: "Cannot find package 'jose'" });

describe('a jose that cannot load', () => {
  afterEach(() => {
    useImporter({ importer: defaultImporter });
  });

  test('a failed load is not kept - the next call loads jose', async () => {
    let attempts = 0;
    useImporter({
      importer: () => {
        attempts += 1;
        return attempts === 1 ? Promise.reject(MISSING_JOSE) : defaultImporter();
      },
    });

    const firstLoad = await JoseLoader.load().catch((error: unknown) => error);
    const jose = await JoseLoader.load();

    expect(firstLoad).toBe(MISSING_JOSE);
    expect(typeof jose.jwtVerify).toBe('function');
    expect(attempts).toBe(2);
  });

  test.each([
    { configured: 'JWT', options: { jwtOptions: JWT_OPTIONS } },
    { configured: 'service', options: { serviceOptions: SERVICE_OPTIONS } },
  ])(
    'fails the boot of an application with $configured authentication, naming jose',
    async ({ options }) => {
      useImporter({ importer: () => Promise.reject(MISSING_JOSE) });

      const failure = await buildApplication(options)
        .initialize()
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty(
        'message',
        "[AuthenticateComponent] Cannot load 'jose', which JWT and service authentication need. Please install it | Error: Cannot find package 'jose'",
      );
      expect(failure).toHaveProperty('cause', MISSING_JOSE);
    },
  );

  test('the same application boots when jose loads, and loads it once, at boot', async () => {
    let attempts = 0;
    useImporter({
      importer: () => {
        attempts += 1;
        return defaultImporter();
      },
    });

    await buildApplication({ jwtOptions: JWT_OPTIONS }).initialize();

    expect(attempts).toBe(1);
  });

  test('an application with Basic authentication only boots without jose', async () => {
    let attempts = 0;
    useImporter({
      importer: () => {
        attempts += 1;
        return Promise.reject(MISSING_JOSE);
      },
    });

    await buildApplication({ basicOptions: BASIC_OPTIONS }).initialize();

    expect(attempts).toBe(0);
  });
});
