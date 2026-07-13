import { describe, expect, test } from 'bun:test';
import { HTTP, THttpMethod } from '@/common';
import { NodeFetchNetworkRequest } from '@/modules/network';
// Module path, never the barrel: axios is an optional peer.
import { AxiosNetworkRequest } from '@/modules/network/http-request/fetcher/axios-fetcher';

/**
 * A caller may spell a method in either case; what leaves for the wire must always be the uppercase
 * token. This is not cosmetic: undici normalizes only DELETE/GET/HEAD/OPTIONS/POST/PUT, so a
 * lowercase `patch`/`query` would travel verbatim and the server would reject it. Bun's fetch
 * uppercases everything, which hides the bug until the app runs on Node - hence the exhaustive
 * matrix rather than a spot check.
 *
 * The method is echoed back in a HEADER, not the body, so HEAD (which carries no body) is covered
 * by the same assertion as the rest.
 */
const METHODS = Object.values(HTTP.Methods);

const withEchoServer = async (assertion: (opts: { baseUrl: string }) => Promise<void>) => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      return new Response(null, {
        status: 204,
        headers: { ['x-echo-method']: request.method },
      });
    },
  });

  try {
    await assertion({ baseUrl: `http://localhost:${server.port}` });
  } finally {
    await server.stop(true);
  }
};

describe('HTTP method case - every method, both spellings, both clients', () => {
  for (const method of METHODS) {
    const lower = method;
    const upper = method.toUpperCase() as THttpMethod;

    test(`NodeFetch: '${lower}' and '${upper}' both reach the wire as ${upper}`, async () => {
      await withEchoServer(async ({ baseUrl }) => {
        const client = new NodeFetchNetworkRequest({
          name: 'node-case',
          networkOptions: { baseUrl },
        });

        for (const spelling of [lower, upper] as THttpMethod[]) {
          const response = await client
            .getNetworkService()
            .send({ url: `${baseUrl}/probe`, method: spelling });

          expect(response.headers.get('x-echo-method')).toBe(upper);
        }
      });
    });

    test(`Axios: '${lower}' and '${upper}' both reach the wire as ${upper}`, async () => {
      await withEchoServer(async ({ baseUrl }) => {
        const client = new AxiosNetworkRequest({
          name: 'axios-case',
          networkOptions: { baseUrl },
        });

        for (const spelling of [lower, upper] as THttpMethod[]) {
          const response = await client
            .getNetworkService()
            .send({ url: `${baseUrl}/probe`, method: spelling });

          expect(response.headers['x-echo-method']).toBe(upper);
        }
      });
    });
  }

  test('an omitted method defaults to GET on the wire', async () => {
    await withEchoServer(async ({ baseUrl }) => {
      const nodeClient = new NodeFetchNetworkRequest({
        name: 'node-default',
        networkOptions: { baseUrl },
      });
      const axiosClient = new AxiosNetworkRequest({
        name: 'axios-default',
        networkOptions: { baseUrl },
      });

      const nodeResponse = await nodeClient.getNetworkService().send({ url: `${baseUrl}/probe` });
      const axiosResponse = await axiosClient.getNetworkService().send({ url: `${baseUrl}/probe` });

      expect(nodeResponse.headers.get('x-echo-method')).toBe('GET');
      expect(axiosResponse.headers['x-echo-method']).toBe('GET');
    });
  });

  test('the convenience verbs put the uppercase token on the wire', async () => {
    await withEchoServer(async ({ baseUrl }) => {
      const client = new NodeFetchNetworkRequest({
        name: 'node-verbs',
        networkOptions: { baseUrl },
      });
      const service = client.getNetworkService();

      const verbs = [
        { run: () => service.get({ url: `${baseUrl}/probe` }), expected: 'GET' },
        { run: () => service.post({ url: `${baseUrl}/probe` }), expected: 'POST' },
        { run: () => service.put({ url: `${baseUrl}/probe` }), expected: 'PUT' },
        { run: () => service.patch({ url: `${baseUrl}/probe` }), expected: 'PATCH' },
        { run: () => service.delete({ url: `${baseUrl}/probe` }), expected: 'DELETE' },
        { run: () => service.query({ url: `${baseUrl}/probe` }), expected: 'QUERY' },
      ];

      for (const verb of verbs) {
        const response = await verb.run();
        expect(response.headers.get('x-echo-method')).toBe(verb.expected);
      }
    });
  });
});
