import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/types';
import type { TRouteContext } from '@/base/controllers';
import { BaseRestController } from '@/base/controllers';
import { ControllerTransports } from '@/base/controllers/common/constants';
import { controller } from '@/base/metadata';
import { AppErrorMiddleware } from '@/base/middlewares';
import { jsonContent, jsonResponse } from '@/base/models';
import { RequestTrackerComponent } from '@/components/request-tracker';
import { z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { HTTP, type AnyType, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { parseMultipartBody } from '@venizia/ignis-helpers';
import { describe, expect, test } from 'bun:test';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

@controller({ path: '/echo' })
class EchoController extends BaseRestController {
  constructor() {
    super({ scope: EchoController.name, path: '/echo', isStrict: false });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({
      configs: {
        method: HTTP.Methods.GET,
        path: '/',
        responses: jsonResponse({
          schema: z.object({ requestId: z.string() }),
          description: 'Echo request id',
        }),
      },
    }).to({
      handler: (context: TRouteContext) => {
        return context.json({ requestId: String(context.get('requestId') ?? '') }, 200);
      },
    });

    this.bindRoute({
      configs: {
        method: HTTP.Methods.POST,
        path: '/',
        request: {
          body: jsonContent({
            description: 'Echo body',
            schema: z.object({ name: z.string() }),
          }),
        },
        responses: jsonResponse({
          schema: z.object({ name: z.string() }),
          description: 'Echo body back',
        }),
      },
    }).to({
      handler: (context: TRouteContext) => {
        const { name } = context.req.valid<{ name: string }>('json');
        return context.json({ name }, 200);
      },
    });

    this.bindRoute({
      configs: {
        method: HTTP.Methods.POST,
        path: '/upload',
        responses: jsonResponse({
          schema: z.object({ names: z.array(z.string()) }),
          description: 'Echo uploaded file names',
        }),
      },
    }).to({
      handler: async (context: TRouteContext) => {
        const parsed = await parseMultipartBody({ context });
        return context.json({ names: parsed.map(file => file.originalname) }, 200);
      },
    });
  }
}

class TestApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'test-app', version: '0.0.0', description: 'Request tracker test app' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

/** Boots an application with the RequestTrackerComponent + an echo controller mounted. */
const bootTrackedApplication = async (): Promise<OpenAPIHono> => {
  const application = new TestApplication({ scope: 'RequestTrackerTestApp', config: TEST_CONFIGS });
  application.init();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());

  const component = new RequestTrackerComponent(application);
  await component.configure();

  application.controller(EchoController);
  await application['registerControllers']();

  server.route(TEST_CONFIGS.path.base, application.getRootRouter());
  return server;
};

/** In-process requests carry no connection info, so the client ip must come from a header. */
const CLIENT_HEADERS = { 'x-forwarded-for': '10.0.0.1' };

describe('RequestTrackerComponent — request id', () => {
  test('an inbound x-request-id is honoured, not overwritten', async () => {
    const router = await bootTrackedApplication();

    const response = await router.request('/echo', {
      headers: { ...CLIENT_HEADERS, 'x-request-id': 'inbound-request-id' },
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { requestId: string };
    expect(body.requestId).toBe('inbound-request-id');
    expect(response.headers.get('x-request-id')).toBe('inbound-request-id');
  });

  test('a missing x-request-id is generated and echoed back', async () => {
    const router = await bootTrackedApplication();

    const response = await router.request('/echo', { headers: CLIENT_HEADERS });
    const body = (await response.json()) as { requestId: string };

    expect(body.requestId.length).toBeGreaterThan(0);
    expect(response.headers.get('x-request-id')).toBe(body.requestId);
  });
});

describe('RequestTrackerComponent — body parsing', () => {
  test('a JSON body still reaches the route handler after being spied on', async () => {
    const router = await bootTrackedApplication();

    const response = await router.request('/echo', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ignis' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'ignis' });
  });

  test('a malformed JSON body is a clean 400, never an unhandled throw', async () => {
    const router = await bootTrackedApplication();
    const body = '{ "name": ';

    const response = await router.request('/echo', {
      method: 'POST',
      headers: {
        ...CLIENT_HEADERS,
        'content-type': 'application/json',
        'content-length': String(body.length),
      },
      body,
    });
    expect(response.status).toBe(400);

    const responseBody = (await response.json()) as Record<string, AnyType>;
    expect(responseBody.message).toBe('Malformed Body Payload');
  });

  test('an empty body with a JSON content-type does not throw inside the spy', async () => {
    const router = await bootTrackedApplication();

    const response = await router.request('/echo', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'content-type': 'application/json', 'content-length': '0' },
      body: '',
    });

    // `content-length: 0` short-circuits the spy, so the status comes from the downstream route validator, not an unhandled throw inside the middleware.
    const responseBody = (await response.json()) as Record<string, AnyType>;
    expect(responseBody.message).not.toBe('Malformed Body Payload');
  });

  test('a non-JSON content-type body is read as text and passed through', async () => {
    const router = await bootTrackedApplication();
    const body = 'plain text payload';

    const response = await router.request('/echo', {
      method: 'POST',
      headers: {
        ...CLIENT_HEADERS,
        'content-type': 'text/plain',
        'content-length': String(body.length),
      },
      body,
    });

    // The spy itself must not reject a non-JSON payload; the route (JSON body) decides.
    const responseBody = (await response.json()) as Record<string, AnyType>;
    expect(responseBody.message).not.toBe('Malformed Body Payload');
  });

  test('a multipart body survives the spy and still reaches the route handler', async () => {
    const router = await bootTrackedApplication();

    const formData = new FormData();
    formData.append('files', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));

    const response = await router.request('/echo/upload', {
      method: 'POST',
      headers: CLIENT_HEADERS,
      body: formData,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ names: ['photo.jpg'] });
  });
});

describe('RequestTrackerComponent - connection info', () => {
  test('a request whose client ip cannot be determined is still SERVED, not rejected', async () => {
    const router = await bootTrackedApplication();

    // Unix sockets, some proxies and every in-process call yield no connection info; this component exists to OBSERVE traffic, so refusing a request whose client ip is unknown turns a logging gap into an outage.
    const response = await router.request('/echo');

    expect(response.status).toBe(200);
  });

  test('a forwarded ip is still used to identify the client', async () => {
    const router = await bootTrackedApplication();

    const response = await router.request('/echo', {
      headers: { ['x-forwarded-for']: '203.0.113.7' },
    });

    expect(response.status).toBe(200);
  });
});
