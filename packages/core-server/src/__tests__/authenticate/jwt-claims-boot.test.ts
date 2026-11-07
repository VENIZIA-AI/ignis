import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import { AuthenticateComponent } from '@/components/auth/authenticate/component';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  AuthenticateBindingKeys,
  JOSEStandards,
  JWKSModes,
  type IApplicationConfigs,
  type IApplicationInfo,
  type TJWTTokenServiceOptions,
} from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';

/** An application whose authentication configuration has no claims does not boot; the message names the key. */

const CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

class ProbeApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'claims-boot', version: '0.0.0', description: 'claims boot probe' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}
}

const CLAIMS = { issuer: 'identity', audience: 'inventory' };

const JWS = (overrides?: Record<string, unknown>) =>
  ({
    standard: JOSEStandards.JWS,
    options: {
      jwtSecret: 'probe-secret-that-is-long-enough-for-hs256',
      getTokenExpiresFn: () => 60,
      claims: CLAIMS,
      ...overrides,
    },
  }) as unknown as TJWTTokenServiceOptions;

const ISSUER = (overrides?: Record<string, unknown>) =>
  ({
    standard: JOSEStandards.JWKS,
    options: {
      mode: JWKSModes.ISSUER,
      algorithm: 'ES256',
      keys: { driver: 'text', format: 'pem', private: 'unused', public: 'unused' },
      kid: 'kid',
      getTokenExpiresFn: () => 60,
      claims: CLAIMS,
      ...overrides,
    },
  }) as unknown as TJWTTokenServiceOptions;

const VERIFIER = (overrides?: Record<string, unknown>) =>
  ({
    standard: JOSEStandards.JWKS,
    options: {
      mode: JWKSModes.VERIFIER,
      jwksUrl: 'https://identity.example.com/certs',
      claims: CLAIMS,
      verify: { algorithms: ['ES256'] },
      ...overrides,
    },
  }) as unknown as TJWTTokenServiceOptions;

const boot = async (jwtOptions: TJWTTokenServiceOptions): Promise<string | null> => {
  const application = new ProbeApplication({ scope: ProbeApplication.name, config: CONFIGS });
  application.init();
  application
    .bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
    .toValue(jwtOptions);
  application.component(AuthenticateComponent);

  try {
    await application.initialize();
  } catch (error) {
    return error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : String(error);
  }

  return null;
};

describe.each([
  ['JWS', JWS],
  ['JWKS issuer', ISSUER],
  ['JWKS verifier', VERIFIER],
])('the %s configuration', (_name, build) => {
  test('with claims boots', async () => {
    const result = await boot(build());
    expect(result).toBeNull();
  });

  test('without claims refuses to boot, naming claims', async () => {
    const result2 = await boot(build({ claims: undefined }));
    expect(result2).toContain('claims is required');
  });

  test('without claims.issuer refuses to boot, naming the key', async () => {
    const result3 = await boot(build({ claims: { audience: 'inventory' } }));
    expect(result3).toContain('claims.issuer');
  });

  test('without claims.audience boots: it is optional', async () => {
    const result4 = await boot(build({ claims: { issuer: 'identity' } }));
    expect(result4).toBeNull();
  });

  test('with a null claims.audience refuses to boot, naming the key', async () => {
    const result = await boot(build({ claims: { issuer: 'identity', audience: null } }));

    expect(result).toContain('claims.audience');
  });

  test('with a misspelt key in claims refuses to boot, naming it', async () => {
    const message = await boot(build({ claims: { ...CLAIMS, audiance: 'x' } }));

    expect(message).toContain('unknown keys');
    expect(message).toContain('audiance');
  });

  test('with the removed sign or verify.issuer refuses to boot, pointing to claims', async () => {
    const result5 = await boot(build({ sign: { issuer: 'identity' } }));
    expect(result5).toContain('`sign` was removed');
    const result6 = await boot(build({ verify: { issuer: 'identity', algorithms: ['ES256'] } }));
    expect(result6).toContain('verify.issuer was removed');
  });
});

describe('the JWKS verifier configuration', () => {
  test('without verify.algorithms refuses to boot, naming it', async () => {
    const result = await boot(VERIFIER({ verify: undefined }));
    expect(result).toContain('verify.algorithms');
    const result2 = await boot(VERIFIER({ verify: { maxTokenAge: 60 } }));
    expect(result2).toContain('verify.algorithms');
  });
});

describe.each([
  ['JWS', JWS],
  ['JWKS issuer', ISSUER],
  ['JWKS verifier', VERIFIER],
])('the %s configuration, bad claim values', (_name, build) => {
  test('a whitespace issuer refuses to boot', async () => {
    const result = await boot(build({ claims: { issuer: '   ', audience: 'inventory' } }));
    expect(result).toContain('claims.issuer');
  });

  test('an empty audience list refuses to boot', async () => {
    const result2 = await boot(build({ claims: { issuer: 'identity', audience: [] } }));
    expect(result2).toContain('claims.audience');
  });

  test('a verify option that is not an object refuses to boot', async () => {
    const result3 = await boot(build({ verify: 'maxTokenAge' }));
    expect(result3).toContain('verify must be an object');
  });
});

describe('the JWS configuration, algorithm none', () => {
  test("headerAlgorithm 'none' refuses to boot", async () => {
    const result = await boot(JWS({ headerAlgorithm: 'none' }));
    expect(result).toContain("'none'");
  });
});
