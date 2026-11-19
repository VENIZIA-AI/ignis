import { describe, expect, test } from 'bun:test';
import { HTTP } from '@/common';
import {
  AbstractNetworkFetchableHelper,
  type IFetchExchange,
  type IFetchExchangeRequest,
  type IRequestOptions,
  NativeFetcher,
  NativeFetchNetworkRequest,
} from '@/modules/network';
// Reached by module path, never through the barrel: axios is an optional peer.
import { AxiosNetworkRequest } from '@/modules/network/http-request/fetcher/axios-fetcher';

/** A fetcher whose client is a recorder: it keeps the request the pipeline decided to send and answers 200. */
class CapturingFetcher extends AbstractNetworkFetchableHelper<'native', IRequestOptions, Response> {
  lastExchange?: IFetchExchangeRequest;

  constructor() {
    super({ name: 'capturing', variant: 'native' });
  }

  protected override buildUrl(opts: { url: string; params?: Record<string, unknown> }): string {
    const query = new URLSearchParams(
      Object.entries(opts.params ?? {}).map(([name, value]): [string, string] => [
        name,
        String(value),
      ]),
    ).toString();

    return query ? `${opts.url}?${query}` : opts.url;
  }

  protected override async exchange(
    opts: IFetchExchangeRequest,
  ): Promise<IFetchExchange<Response>> {
    this.lastExchange = opts;
    const response = new Response('{}', { status: 200 });

    return {
      response,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      discard: async () => undefined,
      readJson: async () => ({}),
      capped: () => response,
    };
  }
}

describe('HTTP.Methods const-class', () => {
  test('QUERY joins the canonical method const-class', () => {
    expect(HTTP.Methods.QUERY).toBe('query');
  });

  test('every method token is lowercase - route definitions (@hono/zod-openapi) accept no other case', () => {
    const HTTPMethodsEntries = Object.entries(HTTP.Methods);

    for (const [name, token] of HTTPMethodsEntries) {
      expect(`${name}=${token}`).toBe(`${name}=${token.toLowerCase()}`);
    }
  });
});

describe('AbstractNetworkFetchableHelper.query', () => {
  test('hands the client the canonical QUERY token, uppercased, and passes body/headers/params through untouched', async () => {
    const fetcher = new CapturingFetcher();
    const body = { q: 'ignis', filter: 'age > 1' };
    const headers = { ['content-type']: 'application/json' };
    const params = { locale: 'en' };

    await fetcher.query({ url: 'http://example.test/search', body, headers, params });

    // The const-class token is lowercase; the pipeline uppercases it at the wire boundary (undici sends a non-normalized method verbatim, so a lowercase 'query' would never reach the server).
    expect(fetcher.lastExchange?.method).toBe('QUERY');
    expect(fetcher.lastExchange?.body).toEqual(body);
    expect(fetcher.lastExchange?.headers.get('content-type')).toBe('application/json');
    expect(fetcher.lastExchange?.url.toString()).toBe('http://example.test/search?locale=en');
  });

  test('is exposed by every network request client via getNetworkService', () => {
    const nodeFetchRequest = new NativeFetchNetworkRequest({
      name: 'native-client',
      networkOptions: { baseUrl: 'http://example.test' },
    });
    const axiosRequest = new AxiosNetworkRequest({
      name: 'axios-client',
      networkOptions: { baseUrl: 'http://example.test' },
    });

    expect(typeof nodeFetchRequest.getNetworkService().query).toBe('function');
    expect(typeof axiosRequest.getNetworkService().query).toBe('function');
  });
});

/** `tsc --noEmit` is the real gate; `bun test` only proves the module loads. `getVariant()`/`getWorker()` are deliberately widened to `V`/`unknown` on `AbstractNetworkFetchableHelper` (the `./core` path), so every concrete fetcher and `BaseNetworkRequest` must re-narrow them - if either regresses, these method bodies stop compiling. */
describe('getVariant()/getWorker() stay precise off the ./core path', () => {
  class NativeFetcherPrecisionProbe extends NativeFetcher {
    /** Compiles only if `getVariant()` returns the literal `'native'` passed to the constructor, not the widened `V`. */
    assertVariantIsNative(): 'native' {
      return this.getVariant();
    }

    /** Compiles only if `getWorker()` returns `typeof fetch`, not `unknown`. `NativeFetcher` never assigns a worker, so this checks the declared type, not a runtime value. */
    assertWorkerTypeIsFetch(): typeof fetch {
      return this.getWorker();
    }
  }

  test('NativeFetcher keeps getVariant() and getWorker() precise', () => {
    const probe = new NativeFetcherPrecisionProbe({ name: 'precision-probe', defaultConfigs: {} });

    expect(probe.assertVariantIsNative()).toBe('native');
    expect(typeof probe.assertWorkerTypeIsFetch).toBe('function');
  });

  test('AxiosNetworkRequest.getWorker() yields a real AxiosInstance through BaseNetworkRequest, not unknown', () => {
    const request = new AxiosNetworkRequest({
      name: 'axios-worker-precision',
      networkOptions: { baseUrl: 'http://example.test' },
    });

    // Compiles only if BaseNetworkRequest.getWorker() returns TFetcherWorker<'axios'> (AxiosInstance) -
    // `.interceptors` does not exist on `unknown`, the exact shape the regression broke.
    expect(typeof request.getWorker().interceptors).toBe('object');
  });
});

interface IEchoedRequest {
  method: string;
  body: string;
  contentType: string | null;
}

describe('QUERY wire integration against a live Bun.serve echo', () => {
  const payload = JSON.stringify({ q: 'ignis', filter: 'age > 1' });

  const withServer = async (assertion: (opts: { baseUrl: string }) => Promise<void>) => {
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const requestBody = await request.text();

        return new Response(
          JSON.stringify({
            method: request.method,
            body: requestBody,
            contentType: request.headers.get('content-type'),
          }),
          { headers: { ['content-type']: 'application/json' } },
        );
      },
    });

    try {
      await assertion({ baseUrl: `http://localhost:${server.port}` });
    } finally {
      await server.stop(true);
    }
  };

  test('NativeFetchNetworkRequest puts real QUERY on the wire with an intact body', async () => {
    await withServer(async ({ baseUrl }) => {
      const client = new NativeFetchNetworkRequest({
        name: 'native-query',
        networkOptions: { baseUrl },
      });

      const response = await client.getNetworkService().query({
        url: `${baseUrl}/search`,
        body: payload,
        headers: { ['content-type']: 'application/json' },
      });

      const result = await response.json();
      const echoed = result as IEchoedRequest;
      expect(echoed.method).toBe('QUERY');
      expect(echoed.body).toBe(payload);
      expect(echoed.contentType).toBe('application/json');
    });
  });

  test('AxiosNetworkRequest puts real QUERY on the wire with an intact body', async () => {
    await withServer(async ({ baseUrl }) => {
      const client = new AxiosNetworkRequest({
        name: 'axios-query',
        networkOptions: { baseUrl },
      });

      const response = await client.getNetworkService().query({
        url: `${baseUrl}/search`,
        body: payload,
        headers: { ['content-type']: 'application/json' },
      });

      expect(response.data).toEqual({
        method: 'QUERY',
        body: payload,
        contentType: 'application/json',
      });
    });
  });
});
