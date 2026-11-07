import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import { AuthenticateComponent } from '@/components/auth/authenticate/component';
import { JWSTokenService } from '@/components/auth/authenticate/services/bearer/jws.service';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  AuthenticateBindingKeys,
  JOSEStandards,
  type IApplicationConfigs,
  type IApplicationInfo,
  type TJWTTokenServiceOptions,
} from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';

/** The HMAC secret of a JWT is at least 32 bytes: a service refuses a shorter one when it is built, and the application refuses to boot. */

const CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

class ProbeApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'secret-length', version: '0.0.0', description: 'secret length probe' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}
}

const jwtOptions = (jwtSecret: string): TJWTTokenServiceOptions => ({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret,
    getTokenExpiresFn: () => 60,
  },
});

const boot = async (jwtSecret: string): Promise<string | null> => {
  const application = new ProbeApplication({ scope: ProbeApplication.name, config: CONFIGS });
  application.init();
  application
    .bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
    .toValue(jwtOptions(jwtSecret));
  application.component(AuthenticateComponent);

  try {
    await application.initialize();
  } catch (error) {
    return error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : String(error);
  }

  return null;
};

const build = (jwtSecret: string): JWSTokenService => {
  const { options } = jwtOptions(jwtSecret) as { options: AnyType };

  return new JWSTokenService(options);
};

const refusal = (task: () => unknown): string => {
  try {
    task();
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error('expected a refusal');
};

const SECRET_32 = 'a'.repeat(32);
const SECRET_31 = 'a'.repeat(31);

describe('the JWT secret has a minimum length', () => {
  test('32 bytes is accepted, 31 is refused, both by the service and at boot', async () => {
    expect(() => build(SECRET_32)).not.toThrow();
    const result = await boot(SECRET_32);
    expect(result).toBeNull();

    expect(refusal(() => build(SECRET_31))).toContain('jwtSecret is too short: 31 bytes');
    const result2 = await boot(SECRET_31);
    expect(result2).toContain('jwtSecret is too short: 31 bytes');
  });

  test('the message says how many are required and how to make one', () => {
    const message = refusal(() => build('short'));

    expect(message).toContain('at least 32 are required');
    expect(message).toContain('openssl rand -base64 48');
  });

  test('the secret is never echoed in the message', async () => {
    const secret = 'do-not-echo-me-short';

    expect(refusal(() => build(secret))).not.toContain(secret);
    const result3 = await boot(secret);
    expect(result3).not.toContain(secret);
  });

  test('the length is counted in bytes, not characters', () => {
    // 16 two-byte characters are 32 bytes; 31 ASCII characters are 31.
    expect(() => build('é'.repeat(16))).not.toThrow();
    expect(refusal(() => build('é'.repeat(15)))).toContain('30 bytes');
  });

  test('the placeholder and the empty secret are still refused first', async () => {
    const result4 = await boot('unknown_secret');
    expect(result4).toContain('Invalid jwtSecret');
    const result5 = await boot('');
    expect(result5).toContain('Invalid jwtSecret');
  });

  test('a longer secret signs and verifies a token', async () => {
    const service = build('a-secret-of-forty-characters-for-hs256-ok');
    const token = await service.generate({ payload: { userId: 1, roles: [] } as AnyType });

    const result6 = await service.verify({ type: 'Bearer', token });
    expect(result6.userId).toBe(1);
  });
});
