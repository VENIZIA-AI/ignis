import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import {
  BaseRestController,
  controller,
  jsonResponse,
  RestApplication,
} from '@venizia/ignis-kernel';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError, isApplicationError } from '@venizia/ignis-helpers/core';
import { z } from '@hono/zod-openapi';
import { InProcessBffTransport } from '@/transport/in-process';

/**
 * Nothing in the repository calls `app.fetch()` directly before this test - grepped, zero hits. The
 * whole Worker adapter design rests on that call working through a real controller, not a raw Hono
 * route poked in by hand, so this exercises the same path `WorkerApplication` will use.
 *
 * `RestComponent.binding()` (what `registerControllers()` drives) resolves a controller's mount
 * path from the `@controller` decorator's metadata, not from the `path` passed to the constructor -
 * the constructor fallback only serves the controller instance's own `this.path`. Without the
 * decorator here, `registerControllers()` throws "'path' is required for controller metadata".
 */
@controller({ path: '/hello' })
class HelloController extends BaseRestController {
  constructor() {
    super({ scope: HelloController.name, path: '/hello' });
  }

  override binding() {
    this.defineRoute({
      configs: {
        method: HTTP.Methods.GET,
        path: '/',
        responses: jsonResponse({
          description: 'Greeting',
          schema: z.object({ message: z.string() }),
        }),
      },
      handler: context => context.json({ message: 'hello worker' }, 200),
    });
  }
}

/**
 * Registers `HelloController` through the application's own DI mechanism (`controller()`) and
 * mounts it via the real `registerControllers()` - inherited from `RestApplication`, unmodified -
 * which is exactly what `RestComponent.binding()` does. Not a hand-rolled imitation of it: this
 * fails if `RestApplication.registerControllers()` or `RestComponent` is ever deleted or broken.
 */
class InProcessTestApplication extends RestApplication {
  getAppInfo(): IApplicationInfo {
    return {
      name: 'core-worker-in-process-test-app',
      version: '0.0.0',
      description: 'Proves InProcessBffTransport calls a real app.fetch()',
    };
  }

  preConfigure() {}
  postConfigure() {}
  staticConfigure() {}
  setupMiddlewares() {}

  override async initialize(): Promise<void> {
    this.controller(HelloController);
    await this.registerControllers();

    this.getServer().route(this.getProjectConfigs().path.base, this.getRootRouter());
  }
}

const buildApp = async (): Promise<InProcessTestApplication> => {
  const configs: IApplicationConfigs = {
    host: '127.0.0.1',
    port: 0,
    path: { base: '/', isStrict: false },
  };
  const app = new InProcessTestApplication({ scope: 'InProcessTransportTestApp', config: configs });
  await app.initialize();
  return app;
};

describe('InProcessBffTransport drives a real app.fetch()', () => {
  test('a controller mounted through the application mechanism answers a real request', async () => {
    const app = await buildApp();
    const transport = new InProcessBffTransport({
      handler: async request => app.getServer().fetch(request),
    });

    const response = await transport.fetch({
      request: new Request('http://ignis.internal/hello'),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'hello worker' });
  });

  test('an unregistered path still resolves through app.fetch(), as a 404', async () => {
    const app = await buildApp();
    const transport = new InProcessBffTransport({
      handler: async request => app.getServer().fetch(request),
    });

    const response = await transport.fetch({
      request: new Request('http://ignis.internal/unknown'),
    });

    expect(response.status).toBe(404);
  });
});

/**
 * The seam only earns its place if a route that passes here passes over a real Worker. Anything the
 * envelope does to a request or a response - the synthetic origin, the buffered body, an error
 * reduced to `{ text, code, args }` - has to happen here too, or a green in-process test is a
 * promise the Worker breaks.
 */
describe('InProcessBffTransport mirrors what the envelope does', () => {
  test('the handler sees the synthetic origin, whatever origin the caller built against', async () => {
    const seenUrls: string[] = [];
    const transport = new InProcessBffTransport({
      handler: async request => {
        seenUrls.push(request.url);
        return new Response('ok', { status: 200 });
      },
    });

    await transport.fetch({ request: new Request('http://the-page.test/hello?q=1') });

    expect(seenUrls).toEqual(['http://ignis.internal/hello?q=1']);
  });

  test('a response body is buffered, so a stream that fails is the transport failing', async () => {
    const transport = new InProcessBffTransport({
      handler: async () => {
        const stream = new ReadableStream({
          start: streamController => {
            streamController.enqueue(new TextEncoder().encode('partial'));
            streamController.error(new Error('the stream broke'));
          },
        });

        return new Response(stream, { status: 200 });
      },
    });

    // Over a real Worker `encodeResponse` awaits `response.arrayBuffer()`, so this failure happens
    // before anything is posted. In-process it must not resolve with a Response whose body only
    // fails later, when the caller is no longer in a position to retry.
    let caught: unknown;
    try {
      await transport.fetch({ request: new Request('http://ignis.internal/stream') });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
  });

  test('a handler failure arrives as the same ApplicationError the Worker rebuilds', async () => {
    const transport = new InProcessBffTransport({
      handler: async () => {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: 'the datasource is gone',
          messageCode: 'core.system_error',
        });
      },
    });

    let caught: unknown;
    try {
      await transport.fetch({ request: new Request('http://ignis.internal/hello') });
    } catch (error) {
      caught = error;
    }

    expect(isApplicationError(caught)).toBe(true);
    expect((caught as AnyType).statusCode).toBe(HTTP.ResultCodes.RS_5.InternalServerError);
    expect((caught as AnyType).normalized).toEqual({
      text: 'the datasource is gone',
      code: 'core.system_error',
      args: {},
    });
  });

  test('a foreign error arrives normalised, the way the Worker delivers one', async () => {
    const transport = new InProcessBffTransport({
      handler: async () => {
        // Not an `ApplicationError`: a custom subclass loses its prototype and its own properties
        // through structured clone, so this is all a UI can ever receive over a real Worker.
        throw new TypeError('Cannot read properties of undefined');
      },
    });

    let caught: unknown;
    try {
      await transport.fetch({ request: new Request('http://ignis.internal/hello') });
    } catch (error) {
      caught = error;
    }

    expect(isApplicationError(caught)).toBe(true);
    expect((caught as AnyType).statusCode).toBe(HTTP.ResultCodes.RS_5.InternalServerError);
    expect((caught as Error).message).toContain('Cannot read properties of undefined');
  });
});
