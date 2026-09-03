import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { BaseRestController, controller, jsonResponse } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { z } from '@hono/zod-openapi';
import { WorkerApplication } from '@/applications/worker';
import { BffEnvelope } from '@/envelope/encode';
import type { IBffRequestEnvelope, IBffResponseEnvelope } from '@/envelope/types';

const ORIGIN = 'http://ignis.internal';
const ORDER_NOT_FOUND_CODE = 'server.sale.order.not_found';

@controller({ path: '/orders' })
class OrderController extends BaseRestController {
  constructor() {
    super({ scope: OrderController.name, path: '/orders' });
  }

  override binding() {
    this.defineRoute({
      configs: {
        method: HTTP.Methods.GET,
        path: '/',
        responses: jsonResponse({
          description: 'Order',
          schema: z.object({ id: z.string() }),
        }),
      },
      handler: () => {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.NotFound,
          message: 'Order not found',
          messageCode: ORDER_NOT_FOUND_CODE,
        });
      },
    });
  }
}

class ErrorShapeWorkerApplication extends WorkerApplication {
  getAppInfo(): IApplicationInfo {
    return {
      name: 'core-worker-error-shape-test',
      version: '0.0.0',
      description: 'Proves a thrown ApplicationError renders the framework error shape in a Worker',
    };
  }

  preConfigure() {}
  postConfigure() {}
  staticConfigure() {}
  setupMiddlewares() {}

  override async initialize(): Promise<void> {
    this.controller(OrderController);
    await this.registerControllers();
  }
}

const buildConfigs = (): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
});

/** Drives one request through a real `MessagePort` and returns the envelope posted back. */
const requestThroughWorker = async (opts: { path: string }): Promise<IBffResponseEnvelope> => {
  const app = new ErrorShapeWorkerApplication({
    scope: 'ErrorShapeWorkerApplication',
    config: buildConfigs(),
  });

  const { port1, port2 } = new MessageChannel();
  await app.listen({ scope: port1 });

  const received = new Promise<IBffResponseEnvelope>(resolve => {
    port2.addEventListener('message', event => {
      resolve(event.data as IBffResponseEnvelope);
    });
    port2.start();
  });

  const request = new Request(`${ORIGIN}${opts.path}`);
  const envelope: IBffRequestEnvelope = await BffEnvelope.encodeRequest({
    request,
    id: 'error-shape-1',
  });
  port2.postMessage(envelope);

  return received;
};

/**
 * The BFF contract: one UI, one error shape. A controller that throws an `ApplicationError` must
 * render the framework's normalised envelope inside the Worker exactly as it does on the server -
 * a UI that has to ask which tier failed is the failure a BFF exists to prevent.
 */
describe('WorkerApplication - a thrown ApplicationError renders the framework error shape', () => {
  test('the response carries the error status, its message and its normalized code', async () => {
    const response = await requestThroughWorker({ path: '/orders' });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.NotFound);

    const body = JSON.parse(new TextDecoder().decode(response.body)) as Record<string, any>;

    expect(body.message).toBe('Order not found');
    expect(body.statusCode).toBe(HTTP.ResultCodes.RS_4.NotFound);
    expect(body.normalized).toEqual({
      text: 'Order not found',
      code: ORDER_NOT_FOUND_CODE,
      args: {},
    });
    expect(body.details).toEqual({
      url: `${ORIGIN}/orders`,
      path: '/orders',
    });

    // `context.json` drops an undefined value entirely rather than emitting null, so an unset
    // request id is an ABSENT key, not an empty one - the shape a UI branches on, silently gone.
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
  });
});
