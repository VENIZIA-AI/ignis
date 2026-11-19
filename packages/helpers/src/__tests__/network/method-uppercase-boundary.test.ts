import { afterEach, describe, expect, test } from 'bun:test';
import { HTTP, type THttpMethod } from '@/common';
import { NativeFetcher } from '@/modules/network';
// Module path, never the barrel: axios is an optional peer.
import { AxiosFetcher } from '@/modules/network/http-request/fetcher/axios-fetcher';

/** Pinned at the transport boundary, not via an end-to-end wire check: Bun's fetch and axios both uppercase every method themselves, so a fetcher that forgot would still pass e2e - the bug only surfaces on Node's undici, which normalizes just DELETE/GET/HEAD/OPTIONS/POST/PUT and sends PATCH/QUERY verbatim. */
const METHODS = Object.values(HTTP.Methods);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const captureNativeFetchMethod = async (method?: THttpMethod): Promise<string | undefined> => {
  let captured: string | undefined;

  Reflect.set(globalThis, 'fetch', (_input: unknown, init?: RequestInit) => {
    captured = init?.method;

    return Promise.resolve(new Response(null, { status: 204 }));
  });

  const fetcher = new NativeFetcher({ name: 'boundary-node', defaultConfigs: {} });
  await fetcher.send({ url: 'http://example.test/probe', method });

  return captured;
};

const captureAxiosMethod = async (method?: THttpMethod): Promise<string | undefined> => {
  const fetcher = new AxiosFetcher({ name: 'boundary-axios', defaultConfigs: {} });

  let captured: string | undefined;
  Reflect.set(fetcher.getWorker(), 'request', (props: { method?: string }) => {
    captured = props.method;

    return Promise.resolve({ data: null, status: 200, statusText: 'OK', headers: {} });
  });

  await fetcher.send({ url: 'http://example.test/probe', method });

  return captured;
};

describe('fetchers hand an UPPERCASE method to their transport', () => {
  for (const method of METHODS) {
    const upper = method.toUpperCase();

    test(`NativeFetcher normalizes '${method}' and '${upper}' to ${upper} before fetch()`, async () => {
      const result = await captureNativeFetchMethod(method);
      expect(result).toBe(upper);
      const result2 = await captureNativeFetchMethod(upper as THttpMethod);
      expect(result2).toBe(upper);
    });

    test(`AxiosFetcher normalizes '${method}' and '${upper}' to ${upper} before request()`, async () => {
      const result = await captureAxiosMethod(method);
      expect(result).toBe(upper);
      const result2 = await captureAxiosMethod(upper as THttpMethod);
      expect(result2).toBe(upper);
    });
  }

  test('an omitted method reaches the transport as GET, not as undefined', async () => {
    const result = await captureNativeFetchMethod();
    expect(result).toBe('GET');
    const result2 = await captureAxiosMethod();
    expect(result2).toBe('GET');
  });
});
