import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { ServiceAssertion } from '@venizia/ignis-kernel';
import type { IServiceAuthOptions } from '@venizia/ignis-kernel';
import { NativeFetcher, UrlFetchError } from '@venizia/ignis-helpers/core';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { ServiceAssertionSignerService } from '@/components/auth/authenticate/services/service/signer.service';
import { ServiceAssertionVerifierService } from '@/components/auth/authenticate/services/service/verifier.service';

/**
 * The signer's `onRequest` hook, end to end: a `NativeFetcher` calls a callee that verifies the assertion exactly as the
 * service strategy does (method + percent-encoded path), over real HTTP.
 */

const CALLER = 'commerce';
const CALLEE = 'pricing';

let signer: ServiceAssertionSignerService;
let jwksServer: ReturnType<typeof Bun.serve>;
let calleeServer: ReturnType<typeof Bun.serve>;
let calleeUrl: string;
const seenTokens: string[] = [];
let failFirst = false;
let failures = 0;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair(ServiceAssertion.ALGORITHM, {
    extractable: true,
  });

  const result = await exportPKCS8(privateKey);
  const result2 = await exportSPKI(publicKey);
  signer = new ServiceAssertionSignerService({
    name: CALLER,
    keys: {
      driver: 'text',
      format: 'pem',
      private: result,
      public: result2,
    },
    resolvePrincipal: async () => ({ userId: 1 }),
  });

  jwksServer = Bun.serve({
    port: 0,
    fetch: async () => {
      const jwks = await signer.getPublicJWKS();

      return Response.json(jwks);
    },
  });

  const options: IServiceAuthOptions = {
    name: CALLEE,
    callers: { [CALLER]: `http://localhost:${jwksServer.port}/svc-certs` },
    resolvePrincipal: async () => ({ userId: 1 }),
  };
  const verifier = new ServiceAssertionVerifierService(options);

  calleeServer = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const token = request.headers.get(ServiceAssertion.HEADER) ?? '';
      const { pathname } = new URL(request.url);

      seenTokens.push(token);

      if (failFirst && failures < 1) {
        failures += 1;

        return new Response('try again', { status: 503 });
      }

      try {
        const { issuer } = await verifier.verify({ token, method: request.method, path: pathname });

        return Response.json({ issuer, authorization: request.headers.get('authorization') });
      } catch {
        return new Response('refused', { status: 401 });
      }
    },
  });
  calleeUrl = `http://localhost:${calleeServer.port}`;
});

afterAll(async () => {
  await jwksServer?.stop(true);
  await calleeServer?.stop(true);
});

const fetcherFor = (audience: string) =>
  new NativeFetcher({
    name: 'to-pricing',
    hooks: { onRequest: signer.createRequestHook({ audience }) },
  });

const readJti = (token: string): string => {
  const payload: unknown = JSON.parse(atob(token.split('.')[1] ?? ''));

  return typeof payload === 'object' && payload !== null && 'jti' in payload
    ? String(payload.jti)
    : '';
};

describe('signer.createRequestHook', () => {
  test('the callee accepts a hook-signed call, and Authorization is left to the caller', async () => {
    const response = await fetcherFor(CALLEE).post({
      url: `${calleeUrl}/v1/api/calc`,
      headers: { authorization: 'Bearer user-token' },
      body: { a: 1 },
    });

    const result = await response.json();
    expect(result).toEqual({ issuer: CALLER, authorization: 'Bearer user-token' });
  });

  test('a path with spaces and non-ASCII characters verifies: the hook signs the percent-encoded path', async () => {
    const response = await fetcherFor(CALLEE).get({
      url: `${calleeUrl}/v1/api/sku/ABC 123/quốc`,
    });

    const result2 = await response.json();
    expect(result2 as { issuer: string }).toMatchObject({ issuer: CALLER });
  });

  test('a retried call is signed again: each attempt carries a fresh jti', async () => {
    seenTokens.length = 0;
    failures = 0;
    failFirst = true;

    try {
      const fetcher = new NativeFetcher({
        name: 'retrying',
        hooks: { onRequest: signer.createRequestHook({ audience: CALLEE }) },
        defaults: { retry: { maxAttempts: 2, backoff: { initialDelayMs: 1, maxDelayMs: 2 } } },
      });
      const response = await fetcher.get({ url: `${calleeUrl}/v1/api/retried` });

      expect(response.status).toBe(200);
      expect(seenTokens).toHaveLength(2);
      expect(readJti(seenTokens[0])).not.toBe('');
      expect(readJti(seenTokens[0])).not.toBe(readJti(seenTokens[1]));
    } finally {
      failFirst = false;
    }
  });

  test('a call signed for another audience is refused by the callee', async () => {
    const error = await RejectionHelper.rejectionOf({
      task: fetcherFor('someone-else').get({ url: `${calleeUrl}/v1/api/calc` }),
    });

    expect(UrlFetchError.is(error)).toBe(true);
    expect((error as UrlFetchError).status).toBe(401);
  });

  test('a signer with no keys fails the call, and the request is never sent', async () => {
    const verifyOnly = new ServiceAssertionSignerService({
      name: CALLEE,
      resolvePrincipal: async () => ({ userId: 1 }),
    });
    const before = seenTokens.length;
    const noKeysFetcher = new NativeFetcher({
      name: 'no-keys',
      hooks: { onRequest: verifyOnly.createRequestHook({ audience: CALLEE }) },
    });
    const error = await RejectionHelper.rejectionOf({
      task: noKeysFetcher.get({ url: `${calleeUrl}/v1/api/calc` }),
    });

    expect((error as Error).message).toMatch(/no signing keys/);
    expect(seenTokens.length).toBe(before);
  });
});
