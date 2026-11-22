/** A fetcher built with a baseUrl joins a relative call url to it, the way 0.4.8 let axios do. */

import { afterAll, describe, expect, test } from 'bun:test';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { z } from 'zod';
import { AxiosNetworkRequest } from '@/modules/network/http-request/fetcher/axios-fetcher';
import { NativeFetchNetworkRequest } from '@/modules/network/http-request/fetcher/native-fetcher';

const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: (request) => {
    const { pathname, search } = new URL(request.url);

    return Response.json({ target: `${pathname}${search}` });
  },
});

afterAll(async () => {
  await server.stop(true);
});

const Echo = z.object({ target: z.string() });
const origin = `http://127.0.0.1:${server.port}`;

const clients = (baseUrl?: string) => [
  {
    name: 'axios',
    call: (url: string) =>
      new AxiosNetworkRequest({ name: 'axios-client', networkOptions: { baseUrl } })
        .getNetworkService()
        .get({ url, schema: Echo }),
  },
  {
    name: 'native',
    call: (url: string) =>
      new NativeFetchNetworkRequest({ name: 'native-client', networkOptions: { baseUrl } })
        .getNetworkService()
        .get({ url, schema: Echo }),
  },
];

describe('a relative call url with a baseUrl', () => {
  for (const baseUrl of [`${origin}/v1/api`, `${origin}/v1/api/`]) {
    for (const url of ['/users', 'users', '/users?active=1']) {
      test(`${baseUrl} + ${url}, on both fetchers`, async () => {
        for (const client of clients(baseUrl)) {
          const { data } = await client.call(url);

          expect(data.target).toBe(`/v1/api/users${url.includes('?') ? '?active=1' : ''}`);
        }
      });
    }
  }

  test('an absolute call url is sent as it is', async () => {
    for (const client of clients(`${origin}/v1/api`)) {
      const { data } = await client.call(`${origin}/other`);

      expect(data.target).toBe('/other');
    }
  });

  test('a dot segment is refused, as getRequestUrl refuses it', async () => {
    for (const client of clients(`${origin}/v1/api`)) {
      const error = await RejectionUtility.rejectionOf({ task: client.call('/../admin') });

      expect((error as Error).message).toContain('must stay under the base path');
    }
  });

  test('with no baseUrl a relative url is still a clear error', async () => {
    for (const client of clients()) {
      const error = await RejectionUtility.rejectionOf({ task: client.call('/users') });

      expect((error as Error).message).toContain('Malformed url');
    }
  });
});
