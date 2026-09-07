import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import {
  BaseAppErrorMiddleware,
  BaseRestController,
  controller,
  jsonResponse,
  RestApplication,
} from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { z } from '@hono/zod-openapi';
import { WorkerApplication } from '@/applications/worker';
import { BffEnvelope } from '@/envelope/encode';
import type { IBffRequestEnvelope, IBffResponseEnvelope } from '@/envelope/common';

const ORIGIN = 'http://ignis.internal';
const ORDER_NOT_FOUND_CODE = 'server.sale.order.not_found';

const QUANTITY_SCHEMA = z.object({
  quantity: z.number().refine(n => Number.isInteger(n * 10000), {
    message: 'Must not exceed 4 decimal places',
    params: { code: 'numeric.decimal.too_many_places' },
  }),
});

/** The two throws both hosts must render identically - defined once so neither host can drift into throwing something else. */
const THROWERS = {
  intentional: (): never => {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.NotFound,
      message: 'Order not found',
      messageCode: ORDER_NOT_FOUND_CODE,
      orderId: 'ord-991',
    });
  },
  zod: (): never => {
    const parsed = QUANTITY_SCHEMA.safeParse({ quantity: 1.23456 });

    if (parsed.success) {
      throw getError({ message: 'expected validation to fail' });
    }

    throw parsed.error;
  },
} as const;

@controller({ path: '/orders' })
class OrderController extends BaseRestController {
  constructor() {
    super({ scope: OrderController.name, path: '/orders' });
  }

  override binding() {
    const responses = jsonResponse({
      description: 'Order',
      schema: z.object({ id: z.string() }),
    });

    this.defineRoute({
      configs: { method: HTTP.Methods.GET, path: '/intentional', responses },
      handler: THROWERS.intentional,
    });
    this.defineRoute({
      configs: { method: HTTP.Methods.GET, path: '/zod', responses },
      handler: THROWERS.zod,
    });
  }
}

class ParityWorkerApplication extends WorkerApplication {
  getAppInfo(): IApplicationInfo {
    return {
      name: 'core-worker-error-shape-parity-test',
      version: '0.0.0',
      description: 'Compares the Worker error envelope against the server error envelope',
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

/**
 * What `@venizia/ignis` restores on top of the shared stack - one OPTION now, not a subclass.
 * `ErrorPrettier` is deliberately left out: it changes the log rendering only, never a byte of the
 * response body these tests read.
 */
const SERVER_SHAPED_ENVIRONMENT = (): string | undefined => process.env.NODE_ENV;

/** Silenced: both hosts log the thrown error, and neither log is what these tests read. */
const SILENT_LOGGER = {
  error: () => {},
  log: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  for: () => SILENT_LOGGER,
} as AnyType;

/**
 * The SERVER's wiring, taken from the kernel rather than rebuilt: `registerDefaultMiddlewares()` is
 * the SAME method `WorkerApplication` inherits, so the LIST of registrations can no longer be
 * hand-copied out of step with it. `@venizia/ignis` is deliberately NOT a dependency of this
 * package and must never become one; only its error-middleware subclass is restated above.
 */
class ServerShapedApplication extends RestApplication {
  getAppInfo(): IApplicationInfo {
    return {
      name: 'core-worker-error-shape-parity-server',
      version: '0.0.0',
      description: 'The server half of the parity comparison',
    };
  }

  preConfigure() {}
  postConfigure() {}
  staticConfigure() {}
  setupMiddlewares() {}
  override async initialize(): Promise<void> {}

  protected override buildErrorMiddleware(): BaseAppErrorMiddleware {
    return new BaseAppErrorMiddleware({
      logger: SILENT_LOGGER,
      environment: SERVER_SHAPED_ENVIRONMENT,
    });
  }
}

const buildServerShapedApplication = async () => {
  const application = new ServerShapedApplication({
    scope: 'ServerShapedApplication',
    config: buildConfigs(),
  });
  application.logger = SILENT_LOGGER;
  await application['registerDefaultMiddlewares']();

  const server = application.getServer();
  server.get('/orders/intentional', THROWERS.intentional);
  server.get('/orders/zod', THROWERS.zod);

  return server;
};

interface IProbedResponse {
  status: number;
  contentType: string | null;
  body: Record<string, any>;
}

/**
 * `NODE_ENV: production` is passed explicitly on the Hono env binding, which `isProduction` reads
 * FIRST on both hosts. Without it the server side would follow the ambient `process.env.NODE_ENV`
 * while the Worker - which has no host env at all - always fails closed, and the two would
 * legitimately disagree about `details.stack`/`details.cause` on a developer machine. That
 * asymmetry is the documented fail-closed design, not the divergence these tests exist to catch.
 */
const probeServer = async (opts: { path: string }): Promise<IProbedResponse> => {
  const server = await buildServerShapedApplication();
  const response = await server.request(new Request(`${ORIGIN}${opts.path}`), undefined, {
    NODE_ENV: 'production',
  });

  return {
    status: response.status,
    contentType: response.headers.get(HTTP.Headers.CONTENT_TYPE),
    body: (await response.json()) as Record<string, any>,
  };
};

/** Drives the REAL `WorkerApplication.listen()` over a real `MessagePort`, exactly as a browser would. */
const probeWorker = async (opts: { path: string }): Promise<IProbedResponse> => {
  const application = new ParityWorkerApplication({
    scope: 'ParityWorkerApplication',
    config: buildConfigs(),
  });

  const { port1, port2 } = new MessageChannel();
  await application.listen({ scope: port1 });

  const received = new Promise<IBffResponseEnvelope>(resolve => {
    port2.addEventListener('message', event => {
      resolve(event.data as IBffResponseEnvelope);
    });
    port2.start();
  });

  const request = new Request(`${ORIGIN}${opts.path}`);
  const envelope: IBffRequestEnvelope = await BffEnvelope.encodeRequest({
    request,
    id: 'parity-1',
  });
  port2.postMessage(envelope);

  const response = await received;
  const headers = new Headers(response.headers);

  return {
    status: response.status,
    contentType: headers.get(HTTP.Headers.CONTENT_TYPE),
    body: JSON.parse(new TextDecoder().decode(response.body)) as Record<string, any>,
  };
};

/** Every dotted key path in a body, arrays treated as leaves - the SHAPE, with no value in it. Enumerating today's keys by hand would go stale the moment either host grew a field; comparing the two shapes against each other cannot. */
const collectKeyPaths = (opts: { value: unknown; prefix?: string }): Array<string> => {
  const { value, prefix = '' } = opts;

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    return collectKeyPaths({ value: entry, prefix: prefix ? `${prefix}.${key}` : key });
  });
};

const keyPathsOf = (body: unknown): Array<string> => {
  return collectKeyPaths({ value: body }).sort();
};

/** The request id is the one field that legitimately differs - the hosts generate it differently. Everything else must match byte for byte. */
const withNeutralRequestId = (body: Record<string, any>): Record<string, any> => {
  return { ...body, requestId: '<request-id>' };
};

const expectSameEnvelope = (opts: { server: IProbedResponse; worker: IProbedResponse }) => {
  const { server, worker } = opts;

  expect(worker.status).toBe(server.status);
  expect(worker.contentType).toBe(server.contentType);

  // Asserted before the deep compare: a missing field shows up here as a named path, which is
  // exactly how `requestId` going absent in the Worker would have been caught.
  expect(keyPathsOf(worker.body)).toEqual(keyPathsOf(server.body));
  expect(withNeutralRequestId(worker.body)).toEqual(withNeutralRequestId(server.body));

  for (const body of [server.body, worker.body]) {
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
  }
};

/** One UI, one error shape. Every response a controller can produce by failing must look the same whether it ran on the Bun server or inside the Worker - a UI that has to ask which tier failed is the failure a BFF exists to prevent. */
describe('the Worker error envelope matches the server error envelope', () => {
  test('a thrown ApplicationError - same keys, same values, a request id on both', async () => {
    const server = await probeServer({ path: '/orders/intentional' });
    const worker = await probeWorker({ path: '/orders/intentional' });

    expect(server.status).toBe(HTTP.ResultCodes.RS_4.NotFound);
    expect(server.body.normalized.code).toBe(ORDER_NOT_FOUND_CODE);
    expect(server.body.extra).toEqual({ orderId: 'ord-991' });

    expectSameEnvelope({ server, worker });
  });

  test('a ZodError - the 422 branch builds its own envelope, and it matches too', async () => {
    const server = await probeServer({ path: '/orders/zod' });
    const worker = await probeWorker({ path: '/orders/zod' });

    expect(server.status).toBe(HTTP.ResultCodes.RS_4.UnprocessableEntity);
    expect(server.body.normalized.code).toBe('numeric.decimal.too_many_places');

    expectSameEnvelope({ server, worker });
  });

  test('an unrouted path - JSON on both, never the text/plain Hono default', async () => {
    const server = await probeServer({ path: '/orders/nothing-here' });
    const worker = await probeWorker({ path: '/orders/nothing-here' });

    expect(server.status).toBe(HTTP.ResultCodes.RS_4.NotFound);
    // The whole point of installing `notFoundHandler`: `await response.json()` on this must not
    // throw a SyntaxError in the browser.
    expect(worker.contentType).toContain(HTTP.HeaderValues.APPLICATION_JSON);

    expectSameEnvelope({ server, worker });
  });
});
