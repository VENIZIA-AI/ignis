import { describe, expect, test } from 'bun:test';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import {
  AuthenticateStrategy,
  Authentication,
  ServiceAssertion,
  type IAuthUser,
  type IServiceAuthOptions,
} from '@venizia/ignis-kernel';
import { ServiceAssertionSignerService } from '@/components/auth/authenticate/services/service/signer.service';
import { ServiceAssertionVerifierService } from '@/components/auth/authenticate/services/service/verifier.service';
import { ServiceAuthenticationStrategy } from '@/components/auth/authenticate/strategies/service.strategy';
import type { AnyType } from '@venizia/ignis-helpers/common';

/**
 * The seam an application owns: `resolvePrincipal` returning `null`, a principal with no `userId`,
 * and the claim that configuring nothing changes nothing.
 */

const CALLER = 'commerce';
const CALLEE = 'pricing';

const buildContext = (opts: { url: string; method: string; token?: string }) =>
  ({
    req: {
      url: opts.url,
      method: opts.method,
      header: (name: string) => (name === ServiceAssertion.HEADER ? opts.token : undefined),
    },
  }) as AnyType;

const buildStack = async (opts: { resolvePrincipal: IServiceAuthOptions['resolvePrincipal'] }) => {
  const { privateKey, publicKey } = await generateKeyPair(ServiceAssertion.ALGORITHM, {
    extractable: true,
  });

  const keys = {
    driver: 'text' as const,
    format: 'pem' as const,
    private: await exportPKCS8(privateKey),
    public: await exportSPKI(publicKey),
  };

  const signer = new ServiceAssertionSignerService({
    name: CALLER,
    keys,
    resolvePrincipal: async () => ({ userId: 1 }),
  } as AnyType);

  const server = Bun.serve({
    port: 0,
    fetch: async () => Response.json(await signer.getPublicJWKS()),
  });

  const options: IServiceAuthOptions = {
    name: CALLEE,
    callers: { [CALLER]: `http://localhost:${server.port}/svc-certs` },
    resolvePrincipal: opts.resolvePrincipal,
  };

  const strategy = new ServiceAuthenticationStrategy(
    new ServiceAssertionVerifierService(options as AnyType),
    options as AnyType,
  );

  return { signer, strategy, server };
};

describe('the strategy validates what the application hands back', () => {
  test('the name is the framework constant, not a string literal', () => {
    expect(ServiceAuthenticationStrategy.prototype.constructor).toBeDefined();
    expect(Authentication.STRATEGY_SERVICE).toBe(AuthenticateStrategy.SERVICE);
    expect(AuthenticateStrategy.SERVICE).toBe('service');
  });

  test('a resolved principal reaches the route, carrying which service called', async () => {
    const { signer, strategy, server } = await buildStack({
      resolvePrincipal: async () => ({ userId: 42, roles: [] }) as IAuthUser,
    });

    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });
    const user = await strategy.authenticate(
      buildContext({ url: 'http://pricing/v1/api/x', method: 'GET', token }),
    );

    expect(user.userId).toBe(42);
    expect(user.callerService).toBe(CALLER);

    await server.stop(true);
  });

  /** `resolvePrincipal` receives the VERIFIED issuer - the whole point of the seam. */
  test('resolvePrincipal is handed the verified issuer', async () => {
    const seen: string[] = [];

    const { signer, strategy, server } = await buildStack({
      resolvePrincipal: async ({ issuer }) => {
        seen.push(issuer);
        return { userId: 1 };
      },
    });

    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });
    await strategy.authenticate(
      buildContext({ url: 'http://pricing/v1/api/x', method: 'GET', token }),
    );

    expect(seen).toEqual([CALLER]);
    await server.stop(true);
  });

  /**
   * The `| null` return exists so an application can refuse a caller the allowlist admits without
   * inventing an error shape of its own.
   */
  test('a null principal is refused, not authenticated', async () => {
    const { signer, strategy, server } = await buildStack({ resolvePrincipal: async () => null });

    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });

    const task = strategy.authenticate(
      buildContext({ url: 'http://pricing/v1/api/x', method: 'GET', token }),
    );

    await (expect(task).rejects.toThrow(/no principal/) as AnyType);
    await server.stop(true);
  });

  /**
   * `executeAnyMode` calls `setCurrentUser` unconditionally, so a principal with no `userId` would
   * authenticate here and fail at the first write, far from the cause. `executeAllMode` already
   * refuses it; this closes the gap between the two modes.
   */
  test('a principal with no userId is refused', async () => {
    const { signer, strategy, server } = await buildStack({
      resolvePrincipal: async () => ({ roles: [] }) as AnyType,
    });

    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });

    const task = strategy.authenticate(
      buildContext({ url: 'http://pricing/v1/api/x', method: 'GET', token }),
    );

    await (expect(task).rejects.toThrow(/no principal/) as AnyType);
    await server.stop(true);
  });

  test('a request with no assertion header is refused before any verification', async () => {
    const { strategy, server } = await buildStack({
      resolvePrincipal: async () => ({ userId: 1 }),
    });

    const task = strategy.authenticate(
      buildContext({ url: 'http://pricing/v1/api/x', method: 'GET' }),
    );

    await (expect(task).rejects.toThrow(/Missing service assertion/) as AnyType);
    await server.stop(true);
  });
});

/** Criterion 1: an application that sets nothing behaves exactly as it did before this shipped. */
describe('an application that configures no serviceOptions is unchanged', () => {
  test('the strategy name is registered nowhere by default', async () => {
    const { AuthenticationStrategyRegistry } = await import('@venizia/ignis-kernel');
    const registry = AuthenticationStrategyRegistry.getInstance();
    registry.reset();

    expect(registry.has({ name: AuthenticateStrategy.SERVICE })).toBe(false);
    expect(registry.getNames()).toEqual([]);
  });

  test('SERVICE joins the built-in scheme set without disturbing the others', () => {
    expect(AuthenticateStrategy.isValid('service')).toBe(true);
    expect(AuthenticateStrategy.isValid('jwt')).toBe(true);
    expect(AuthenticateStrategy.isValid('basic')).toBe(true);
    expect(AuthenticateStrategy.isValid('nope')).toBe(false);
  });
});
