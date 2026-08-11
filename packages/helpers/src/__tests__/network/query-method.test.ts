import { describe, expect, test } from 'bun:test';
import { HTTP } from '@/common';
import {
  AbstractNetworkFetchableHelper,
  IRequestOptions,
  NodeFetcher,
  NodeFetchNetworkRequest,
} from '@/modules/network';
// Reached by module path, never through the barrel: axios is an optional peer.
import { AxiosNetworkRequest } from '@/modules/network/http-request/fetcher/axios-fetcher';

class CapturingFetcher extends AbstractNetworkFetchableHelper<'node-fetch', IRequestOptions, any> {
  lastOptions?: IRequestOptions;

  constructor() {
    super({ name: 'capturing', variant: 'node-fetch' });
  }

  override async send(opts: IRequestOptions) {
    this.lastOptions = opts;
    return opts as any;
  }
}

describe('HTTP.Methods const-class', () => {
  test('QUERY joins the canonical method const-class', () => {
    expect(HTTP.Methods.QUERY).toBe('query');
  });

  test('every method token is lowercase - route definitions (@hono/zod-openapi) accept no other case', () => {
    for (const [name, token] of Object.entries(HTTP.Methods)) {
      expect(`${name}=${token}`).toBe(`${name}=${token.toLowerCase()}`);
    }
  });
});

describe('AbstractNetworkFetchableHelper.query', () => {
  test('hands send() the canonical QUERY token and passes body/headers/params through untouched', async () => {
    const fetcher = new CapturingFetcher();
    const body = { q: 'ignis', filter: 'age > 1' };
    const headers = { ['content-type']: 'application/json' };
    const params = { locale: 'en' };

    await fetcher.query({ url: 'http://example.test/search', body, headers, params });

    // The const-class token travels internally; each fetcher uppercases it at the wire boundary (see the live-server tests below - undici sends a non-normalized method verbatim, so a lowercase 'query' would never reach the server).
    expect(fetcher.lastOptions?.method).toBe('query');
    expect(fetcher.lastOptions?.body).toEqual(body);
    expect(fetcher.lastOptions?.headers).toEqual(headers);
    expect(fetcher.lastOptions?.params).toEqual(params);
    expect(fetcher.lastOptions?.url).toBe('http://example.test/search');
  });

  test('is exposed by every network request client via getNetworkService', () => {
    const nodeFetchRequest = new NodeFetchNetworkRequest({
      name: 'node-fetch-client',
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
  class NodeFetcherPrecisionProbe extends NodeFetcher {
    /** Compiles only if `getVariant()` returns the literal `'node-fetch'` passed to the constructor, not the widened `V`. */
    assertVariantIsNodeFetch(): 'node-fetch' {
      return this.getVariant();
    }

    /** Compiles only if `getWorker()` returns `typeof fetch`, not `unknown`. `NodeFetcher` never assigns a worker, so this checks the declared type, not a runtime value. */
    assertWorkerTypeIsFetch(): typeof fetch {
      return this.getWorker();
    }
  }

  test('NodeFetcher keeps getVariant() and getWorker() precise', () => {
    const probe = new NodeFetcherPrecisionProbe({ name: 'precision-probe', defaultConfigs: {} });

    expect(probe.assertVariantIsNodeFetch()).toBe('node-fetch');
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

  test('NodeFetchNetworkRequest puts real QUERY on the wire with an intact body', async () => {
    await withServer(async ({ baseUrl }) => {
      const client = new NodeFetchNetworkRequest({
        name: 'node-fetch-query',
        networkOptions: { baseUrl },
      });

      const response = await client.getNetworkService().query({
        url: `${baseUrl}/search`,
        body: payload,
        headers: { ['content-type']: 'application/json' },
      });

      const echoed = (await response.json()) as IEchoedRequest;
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

      expect(response.data.method).toBe('QUERY');
      expect(response.data.body).toBe(payload);
      expect(response.data.contentType).toBe('application/json');
    });
  });
});
