/** A fetcher built with a baseUrl joins a relative call url to it, the way 0.4.8 let axios do. */

import { afterAll, describe, expect, test } from 'bun:test';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { z } from 'zod';
import {
  AxiosFetcher,
  AxiosNetworkRequest,
  type IAxiosNetworkRequestOptions,
  type IAxiosRequestOptions,
} from '@/modules/network/http-request/fetcher/axios-fetcher';
import {
  NativeFetcher,
  NativeFetchNetworkRequest,
} from '@/modules/network/http-request/fetcher/native-fetcher';

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

  test('a dot segment in the path is refused, as getRequestUrl refuses it', async () => {
    for (const client of clients(`${origin}/v1/api`)) {
      await RejectionUtility.expectRejection({
        task: client.call('/../admin'),
        message: 'must stay under the base path',
      });
    }
  });

  test('the query and the fragment pass as written, even when they look like a dot segment', async () => {
    for (const client of clients(`${origin}/v1/api`)) {
      const next = await client.call('/a?next=/..');
      const drive = await client.call('/a?p=C:%5Cx');

      expect(next.data.target).toBe('/v1/api/a?next=/..');
      expect(drive.data.target).toBe('/v1/api/a?p=C:%5Cx');
    }
  });

  test('an empty url is the base itself, as axios sent it', async () => {
    for (const client of clients(`${origin}/v1/api`)) {
      const empty = await client.call('');
      const queryOnly = await client.call('?x=1');

      expect(empty.data.target).toBe('/v1/api');
      expect(queryOnly.data.target).toBe('/v1/api?x=1');
    }
  });

  test('a protocol-relative url stays under the base: it never names another host', async () => {
    for (const client of clients(`${origin}/v1/api`)) {
      const sameName = await client.call('//users');
      const otherHost = await client.call('//evil.test/x');

      expect(sameName.data.target).toBe('/v1/api//users');
      expect(otherHost.data.target).toBe('/v1/api//evil.test/x');
    }
  });

  test('with no baseUrl a relative url is still a clear error', async () => {
    for (const client of clients()) {
      await RejectionUtility.expectRejection({
        task: client.call('/users'),
        message: 'Malformed url',
      });
    }
  });
});

describe('a fetcher built directly', () => {
  test('AxiosFetcher takes the base from baseUrl, and from defaultConfigs.baseURL as 0.4.8 did', async () => {
    const byOption = new AxiosFetcher({
      name: 'a',
      defaultConfigs: {},
      baseUrl: `${origin}/v1/api`,
    });
    const byConfig = new AxiosFetcher({
      name: 'b',
      defaultConfigs: { baseURL: `${origin}/v1/api` },
    });

    for (const fetcher of [byOption, byConfig]) {
      const { data } = await fetcher.get({ url: '/users', schema: Echo });

      expect(data.target).toBe('/v1/api/users');
    }
  });

  test('NativeFetcher takes the base from baseUrl', async () => {
    const fetcher = new NativeFetcher({ name: 'n', baseUrl: `${origin}/v1/api` });
    const { data } = await fetcher.get({ url: 'users', schema: Echo });

    expect(data.target).toBe('/v1/api/users');
  });
});

describe('the axios fields that would break the join are type errors', () => {
  test('baseURL and allowAbsoluteUrls on a call, allowAbsoluteUrls on the defaults', () => {
    const call: IAxiosRequestOptions = {
      url: '/users',
      // @ts-expect-error - the base is the fetcher's baseUrl
      baseURL: 'http://other.test',
      // @ts-expect-error - the pipeline sends one absolute url
      allowAbsoluteUrls: false,
    };
    const networkOptions: IAxiosNetworkRequestOptions['networkOptions'] = {
      // @ts-expect-error - axios would join the absolute url a second time
      allowAbsoluteUrls: false,
    };

    expect([call, networkOptions]).toHaveLength(2);
  });
});
