import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { StaticAssetStorageTypes } from '@/components/static-asset/common';
import { AssetControllerFactory } from '@/components/static-asset/controller';
import {
  AssetPresignProxy,
  AssetProxyErrors,
  type IAssetProxyOptions,
} from '@/components/static-asset/proxy';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { RecordUtility } from '@venizia/ignis-helpers';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from '../fake-storage.helper';

// -----------------------------------------------------------------------------
// The proxy forwards a presigned storage request to the storage endpoint. A real server stands in for the storage, so
// what is checked is what really reaches it: the path, the query, the body and the headers.
// -----------------------------------------------------------------------------
const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class ProxyApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'proxy-app', version: '0.0.0', description: '' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

interface IReceived {
  method: string;
  target: string;
  headers: Record<string, string>;
  body: string;
}

const received: IReceived[] = [];
let storage: ReturnType<typeof Bun.serve>;
let endpoint: string;

beforeAll(() => {
  storage = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      const body = await request.text();
      received.push({
        method: request.method,
        target: `${url.pathname}${url.search}`,
        headers: Object.fromEntries(request.headers),
        body,
      });

      if (url.pathname.endsWith('/cookie')) {
        return new Response('ok', { headers: { 'set-cookie': 'sid=1', etag: '"abc"' } });
      }

      if (url.pathname.endsWith('/denied')) {
        return new Response('denied', { status: 403 });
      }

      return new Response(`stored:${request.method}`, { headers: { etag: '"abc"' } });
    },
  });
  endpoint = `http://127.0.0.1:${storage.port}`;
});

afterAll(async () => {
  await storage.stop(true);
});

const mount = async (opts: {
  proxy?: Partial<IAssetProxyOptions> & { enable?: boolean };
  bucket?: string | (() => string);
}): Promise<OpenAPIHono> => {
  MetadataRegistry.getInstance().clearAll();
  const application = new ProxyApplication({ scope: 'ProxyApp', config: TEST_CONFIGS });
  application.init();

  application.controller(
    AssetControllerFactory.defineAssetController({
      controller: {
        name: 'ProxyAssetController',
        basePath: '/assets',
        isStrict: false,
        bucket: opts.bucket ?? 'images',
        proxy:
          opts.proxy === undefined
            ? undefined
            : { enable: true, upstreamEndpoint: endpoint, ...opts.proxy },
      },
      storage: StaticAssetStorageTypes.DISK,
      helper: new FakeStorageHelper(),
      useMetaLink: false,
    }),
  );
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());

  return server;
};

const codeOf = async (response: Response): Promise<string | undefined> => {
  const json: unknown = await response.json();
  const error =
    RecordUtility.isRecord(json) && RecordUtility.isRecord(json.error) ? json.error : json;
  const normalized = RecordUtility.isRecord(error) ? error.normalized : undefined;

  return RecordUtility.isRecord(normalized) && typeof normalized.code === 'string'
    ? normalized.code
    : undefined;
};

const lastReceived = () => received.at(-1);
const REFUSED = AssetProxyErrors.PATH_REFUSED.message.code;

describe('the proxy is a flag', () => {
  test('without it, or with enable: false, no proxy route exists and nothing is forwarded', async () => {
    received.length = 0;

    for (const proxy of [undefined, { enable: false }]) {
      const router = await mount({ proxy });
      const response = await router.request('/assets/proxy/images/a.png', {
        method: 'PUT',
        body: 'x',
        headers: { 'content-type': 'image/png' },
      });

      expect(response.status).toBe(404);
    }

    expect(received).toEqual([]);
  });

  test('with it, a PUT reaches the storage with its path, query, body and signed headers', async () => {
    received.length = 0;
    const router = await mount({ proxy: {} });

    const response = await router.request(
      '/assets/proxy/images/a%20b.png?X-Amz-Signature=sig&X-Amz-Expires=600',
      {
        method: 'PUT',
        body: 'bytes',
        headers: {
          'content-type': 'application/octet-stream',
          'x-amz-tagging': 'temp=true',
          authorization: 'Bearer secret',
          cookie: 'session=1',
          'x-custom': 'nope',
        },
      },
    );

    expect(response.status).toBe(200);
    const result = await response.text();
    expect(result).toBe('stored:PUT');
    expect(lastReceived()).toMatchObject({
      method: 'PUT',
      target: '/images/a%20b.png?X-Amz-Signature=sig&X-Amz-Expires=600',
      body: 'bytes',
    });
    expect(lastReceived()?.headers['content-type']).toBe('application/octet-stream');
    expect(lastReceived()?.headers['x-amz-tagging']).toBe('temp=true');
    expect(lastReceived()?.headers['authorization']).toBeUndefined();
    expect(lastReceived()?.headers['cookie']).toBeUndefined();
    expect(lastReceived()?.headers['x-custom']).toBeUndefined();
  });

  test('a GET is forwarded too, and the storage status and body come back as they are', async () => {
    const router = await mount({ proxy: {} });

    const ok = await router.request('/assets/proxy/images/a.png?X-Amz-Signature=sig');
    const denied = await router.request('/assets/proxy/images/denied');

    const result2 = await ok.text();
    expect(result2).toBe('stored:GET');
    expect(ok.headers.get('etag')).toBe('"abc"');
    expect(denied.status).toBe(403);
    const result3 = await denied.text();
    expect(result3).toBe('denied');
  });

  test("the headers that are passed on are the application's to choose", async () => {
    const router = await mount({ proxy: { forwardRequestHeaders: ['x-custom'] } });

    await router.request('/assets/proxy/images/a.png', {
      method: 'PUT',
      body: 'x',
      headers: { 'content-type': 'image/png', 'x-custom': 'yes' },
    });

    expect(lastReceived()?.headers['x-custom']).toBe('yes');
    expect(lastReceived()?.headers['content-type']).not.toBe('image/png');
  });

  test('a cookie the storage sets is never handed to the browser', async () => {
    const router = await mount({ proxy: {} });

    const response = await router.request('/assets/proxy/images/cookie');

    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('etag')).toBe('"abc"');
  });

  test("the route path and an endpoint with its own path are the application's to set", async () => {
    received.length = 0;
    const router = await mount({
      proxy: { path: '/upload/', upstreamEndpoint: `${endpoint}/s3/` },
    });

    const response = await router.request('/assets/upload/images/a.png', {
      method: 'PUT',
      body: 'x',
    });

    expect(response.status).toBe(200);
    expect(lastReceived()?.target).toBe('/s3/images/a.png');
  });
});

describe('where the proxy forwards', () => {
  test('only into the bucket of the controller: another bucket, a longer name and the bare bucket are a 404 and reach nothing', async () => {
    received.length = 0;
    const router = await mount({ proxy: {} });

    for (const path of [
      '/assets/proxy/other/a.png',
      '/assets/proxy/images',
      '/assets/proxy/imagesx/a.png',
    ]) {
      const response = await router.request(path, { method: 'PUT', body: 'x' });

      expect(response.status).toBe(404);
      const result = await codeOf(response);
      expect(result).toBe(REFUSED);
    }

    // A path the route does not even match never reaches the handler; it is not forwarded either.
    const unmatched = await router.request('/assets/proxy//other/a.png', {
      method: 'PUT',
      body: 'x',
    });
    expect(unmatched.status).toBe(404);

    expect(received).toEqual([]);
  });

  test('a request line that was never normalised cannot climb out of the bucket (the client normalises dots, a raw socket does not)', async () => {
    received.length = 0;
    const proxy = { enable: true, upstreamEndpoint: endpoint };
    const raw = (path: string): AnyType => ({
      url: `http://localhost${path}`,
      method: 'PUT',
      headers: new Headers(),
      body: null,
    });

    for (const path of [
      '/assets/proxy/images/../other/a.png',
      '/assets/proxy/images/%2e%2e/other/a.png',
      '/assets/proxy/images/%2E%2E/%2e%2e/other/a.png',
      '/assets/proxy/images/./../../etc',
    ]) {
      const task = AssetPresignProxy.forward({
        request: raw(path),
        mountPath: '/proxy',
        proxy,
        bucket: 'images',
      });

      const result2 = await RejectionHelper.rejectionOf({ task });
      expect(result2).toMatchObject({ statusCode: 404 });
    }

    expect(received).toEqual([]);
  });

  test('a bucket given as a function is read on each request', async () => {
    let bucket = 'images';
    const router = await mount({ proxy: {}, bucket: () => bucket });

    const result3 = await router.request('/assets/proxy/images/a.png');
    expect(result3.status).toBe(200);
    bucket = 'moved';
    const result4 = await router.request('/assets/proxy/images/a.png');
    expect(result4.status).toBe(404);
    const result5 = await router.request('/assets/proxy/moved/a.png');
    expect(result5.status).toBe(200);
  });

  test('explicit prefixes replace the bucket rule', async () => {
    const router = await mount({ proxy: { allowedPathPrefixes: ['/tenant-a/', '/tenant-b/'] } });

    const result6 = await router.request('/assets/proxy/tenant-a/x');
    expect(result6.status).toBe(200);
    const result7 = await router.request('/assets/proxy/tenant-b/x');
    expect(result7.status).toBe(200);
    const result8 = await router.request('/assets/proxy/images/x');
    expect(result8.status).toBe(404);
  });

  test('a proxy that would be open to the whole storage is refused at registration', async () => {
    const noBucket = mount({ proxy: {}, bucket: undefined });
    const unscoped = AssetControllerFactory.defineAssetController.bind(AssetControllerFactory);

    const result9 = await noBucket;
    expect(result9).toBeDefined();
    expect(() =>
      unscoped({
        controller: {
          name: 'OpenProxy',
          basePath: '/assets',
          proxy: { enable: true, upstreamEndpoint: endpoint },
        },
        storage: StaticAssetStorageTypes.DISK,
        helper: new FakeStorageHelper(),
      }),
    ).toThrow('proxy needs controller.bucket or proxy.allowedPathPrefixes');
    expect(() =>
      unscoped({
        controller: {
          name: 'BadPrefix',
          basePath: '/assets',
          bucket: 'images',
          proxy: { enable: true, upstreamEndpoint: endpoint, allowedPathPrefixes: ['images'] },
        },
        storage: StaticAssetStorageTypes.DISK,
        helper: new FakeStorageHelper(),
      }),
    ).toThrow('must start and end with a slash');
  });

  test('a storage that does not answer is a 502 that names nothing of the endpoint', async () => {
    const router = await mount({ proxy: { upstreamEndpoint: 'http://127.0.0.1:1' } });

    const response = await router.request('/assets/proxy/images/a.png');
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).toContain(AssetProxyErrors.UPSTREAM_FAILED.message.code);
    expect(text).not.toContain('127.0.0.1');
  });
});

describe('errorResponse', () => {
  const plain = (opts: { reason: string }) =>
    opts.reason === 'PATH_REFUSED'
      ? new Response('Not Found', { status: 404, headers: { 'x-plain': '1' } })
      : new Response('Bad Gateway', { status: 502, headers: { 'x-plain': '1' } });

  test('replaces the JSON answer of a refused path and of a dead storage, and nothing is forwarded for the first', async () => {
    received.length = 0;
    const router = await mount({ proxy: { errorResponse: plain } });

    const refused = await router.request('/assets/proxy/other/a.png', { method: 'PUT', body: 'x' });
    expect(refused.status).toBe(404);
    const result = await refused.text();
    expect(result).toBe('Not Found');
    expect(refused.headers.get('x-plain')).toBe('1');
    expect(received).toEqual([]);

    const dead = await mount({
      proxy: { upstreamEndpoint: 'http://127.0.0.1:1', errorResponse: plain },
    });
    const bad = await dead.request('/assets/proxy/images/a.png');
    expect(bad.status).toBe(502);
    const result2 = await bad.text();
    expect(result2).toBe('Bad Gateway');
  });

  test('returning undefined keeps the default error answer', async () => {
    const router = await mount({ proxy: { errorResponse: () => undefined } });
    const response = await router.request('/assets/proxy/other/a.png', {
      method: 'PUT',
      body: 'x',
    });

    expect(response.status).toBe(404);
    const result3 = await codeOf(response);
    expect(result3).toBe(REFUSED);
  });

  test('a successful forward never asks it', async () => {
    let asked = 0;
    const router = await mount({
      proxy: {
        errorResponse: () => {
          asked += 1;

          return undefined;
        },
      },
    });
    const response = await router.request('/assets/proxy/images/a.png', {
      method: 'PUT',
      body: 'x',
    });

    expect(response.status).toBeLessThan(300);
    expect(asked).toBe(0);
  });
});

describe('cors', () => {
  test('without the option the proxy sets no cors header and has no preflight route', async () => {
    const router = await mount({ proxy: {} });

    const get = await router.request('/assets/proxy/images/a.png');
    const preflight = await router.request('/assets/proxy/images/a.png', { method: 'OPTIONS' });

    expect(get.headers.get('access-control-allow-origin')).toBeNull();
    expect(preflight.status).toBe(404);
  });

  test('with the option the answers carry the origin, the preflight is answered here and the storage never sees it', async () => {
    received.length = 0;
    const router = await mount({ proxy: { cors: { allowOrigin: 'https://app.example' } } });

    const preflight = await router.request('/assets/proxy/images/a.png', { method: 'OPTIONS' });
    const put = await router.request('/assets/proxy/images/a.png', { method: 'PUT', body: 'x' });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, PUT, OPTIONS');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('x-amz-tagging');
    expect(put.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(put.headers.get('access-control-expose-headers')).toContain('ETag');
    expect(received.map((entry) => entry.method)).toEqual(['PUT']);
  });
});
