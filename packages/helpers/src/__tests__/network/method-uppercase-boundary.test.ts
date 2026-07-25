import { afterEach, describe, expect, test } from 'bun:test';
import { AnyType, HTTP, THttpMethod } from '@/common';
import { NodeFetcher } from '@/modules/network';
// Module path, never the barrel: axios is an optional peer.
import { AxiosFetcher } from '@/modules/network/http-request/fetcher/axios-fetcher';

/** Pinned at the transport boundary, not via an end-to-end wire check: Bun's fetch and axios both uppercase every method themselves, so a fetcher that forgot would still pass e2e - the bug only surfaces on Node's undici, which normalizes just DELETE/GET/HEAD/OPTIONS/POST/PUT and sends PATCH/QUERY verbatim. */
const METHODS = Object.values(HTTP.Methods);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const captureNodeFetchMethod = async (method?: THttpMethod): Promise<string | undefined> => {
  let captured: string | undefined;

  globalThis.fetch = ((_input: AnyType, init?: RequestInit) => {
    captured = init?.method;
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as AnyType;

  const fetcher = new NodeFetcher({ name: 'boundary-node', defaultConfigs: {} });
  await fetcher.send({ url: 'http://example.test/probe', method });

  return captured;
};

const captureAxiosMethod = async (method?: THttpMethod): Promise<string | undefined> => {
  const fetcher = new AxiosFetcher({ name: 'boundary-axios', defaultConfigs: {} });

  let captured: string | undefined;
  const worker = fetcher.getWorker() as AnyType;
  worker.request = (props: { method?: string }) => {
    captured = props.method;
    return Promise.resolve({ data: null });
  };

  await fetcher.send({ url: 'http://example.test/probe', method });

  return captured;
};

describe('fetchers hand an UPPERCASE method to their transport', () => {
  for (const method of METHODS) {
    const upper = method.toUpperCase();

    test(`NodeFetcher normalizes '${method}' and '${upper}' to ${upper} before fetch()`, async () => {
      expect(await captureNodeFetchMethod(method)).toBe(upper);
      expect(await captureNodeFetchMethod(upper as THttpMethod)).toBe(upper);
    });

    test(`AxiosFetcher normalizes '${method}' and '${upper}' to ${upper} before request()`, async () => {
      expect(await captureAxiosMethod(method)).toBe(upper);
      expect(await captureAxiosMethod(upper as THttpMethod)).toBe(upper);
    });
  }

  test('an omitted method reaches the transport as GET, not as undefined', async () => {
    expect(await captureNodeFetchMethod()).toBe('GET');
    expect(await captureAxiosMethod()).toBe('GET');
  });
});
