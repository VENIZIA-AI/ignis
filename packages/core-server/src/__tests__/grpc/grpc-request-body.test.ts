import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { GRPC, HTTP, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { ControllerTransports, type IApplicationInfo } from '@venizia/ignis-kernel';
import { Hono } from 'hono';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { BaseApplication } from '@/base/applications';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import { GrpcBindingKeys } from '@/components/controller/grpc';
import { controller } from '@/base/metadata';
import { RequestSpyMiddleware } from '@/base/middlewares/request-spy/request-spy.middleware';

/** `greeter.v1.GreeterService` with one unary method, `SayHello`: the descriptor `protoc-gen-es` writes. */
const GreeterService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIh8KD1NheUhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJIiMKEFNheUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTJXCg5HcmVldGVyU2VydmljZRJFCghTYXlIZWxsbxIbLmdyZWV0ZXIudjEuU2F5SGVsbG9SZXF1ZXN0GhwuZ3JlZXRlci52MS5TYXlIZWxsb1Jlc3BvbnNlYgZwcm90bzM',
  ),
  0,
);

/** The limit of every route, and the larger one of an RPC message. */
const GLOBAL_LIMIT = 100;
const MESSAGE_LIMIT = 1_000;

@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: GreeterService })
class GreeterController extends BaseGrpcController {
  constructor() {
    super({ scope: 'GreeterController' });
  }

  override binding() {
    this.defineRoute({
      configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
      handler: (opts) => ({
        message: String(String(Reflect.get(Object(opts.request), 'name')).length),
      }),
    });
  }
}

class GreeterApplication extends BaseApplication {
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'grpc-body', version: '0.0.0', description: 'gRPC request bodies' };
  }

  override staticConfigure() {}

  override preConfigure() {
    this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
      limits: { messageSize: MESSAGE_LIMIT },
    });
    this.controller(GreeterController);
  }

  override postConfigure() {}

  override setupMiddlewares() {
    this.getServer().use('*', new RequestSpyMiddleware().value());
    this.getRootRouter().post('/echo', (context) => context.json({ ok: true }));
  }
}

const application = new GreeterApplication({
  scope: 'GreeterApplication',
  config: {
    host: '127.0.0.1',
    port: 0,
    path: { base: '/api', isStrict: false },
    transports: [ControllerTransports.REST, ControllerTransports.GRPC],
    middlewares: { bodyLimit: { maxSize: GLOBAL_LIMIT } },
  },
});

const RPC = '/api/grpc/greeter.v1.GreeterService/SayHello';

beforeAll(async () => {
  application.init();
  await application.start();
});

afterAll(async () => {
  await application.stop();
});

const post = async (opts: { path: string; body: string | ReadableStream<Uint8Array> }) => {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: opts.body,
    duplex: 'half',
  };
  const response = await fetch(`http://${application.getServerAddress()}${opts.path}`, init);
  const body = await response.json();

  return { status: response.status, body };
};

const message = (length: number) => JSON.stringify({ name: 'a'.repeat(length) });

const chunked = (text: string) => {
  return new ReadableStream<Uint8Array>({
    start(source) {
      source.enqueue(new TextEncoder().encode(text));
      source.close();
    },
  });
};

describe('an RPC route owns its request body', () => {
  test('a message over the limit of every route, under messageSize, reaches the handler', async () => {
    const result = await post({ path: RPC, body: message(500) });

    expect(result).toEqual({ status: 200, body: { message: '500' } });
  });

  for (const shape of ['sized', 'chunked'] as const) {
    test(`a ${shape} message over messageSize is resource_exhausted`, async () => {
      const text = message(MESSAGE_LIMIT);
      const result = await post({ path: RPC, body: shape === 'sized' ? text : chunked(text) });

      expect(result.body).toHaveProperty('code', 'resource_exhausted');
    });
  }

  test('malformed JSON is invalid_argument', async () => {
    const result = await post({ path: RPC, body: '{bad' });

    expect(result.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    expect(result.body).toHaveProperty('code', 'invalid_argument');
  });

  test('another route keeps the limit', async () => {
    const result = await post({ path: '/api/echo', body: message(500) });

    expect(result.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  test('RequestSpy reads no RPC body, and still reads the others', async () => {
    const spy = new RequestSpyMiddleware();
    const parsed: string[] = [];
    const parseBody = spy.parseBody.bind(spy);

    spy.parseBody = (opts) => {
      parsed.push(opts.req.path);

      return parseBody(opts);
    };

    const server = new GreeterController();
    server.service = GreeterService;
    await server.configure();
    const router = server.getRouter();
    const probe = new Hono();
    probe.use('*', spy.value());
    probe.route('/grpc', router);
    probe.post('/echo', (context) => context.json({ ok: true }));

    const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };
    await probe.request('/grpc/greeter.v1.GreeterService/SayHello', init);
    await probe.request('/echo', init);

    expect(parsed).toEqual(['/echo']);
  });

  test('the debug log of an RPC call carries no body', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const spy = new RequestSpyMiddleware();
    process.env.NODE_ENV = previous;
    const captured: unknown[][] = [];

    const capture = (...args: unknown[]) => {
      captured.push(args);
    };

    const logger = {
      info: capture,
      error: capture,
      warn: capture,
      debug: capture,
      emerg: capture,
      log: capture,
      for: () => logger,
    };
    spy.logger = logger;

    const server = new GreeterController();
    server.service = GreeterService;
    await server.configure();
    const probe = new Hono();
    probe.use('*', spy.value());
    probe.route('/grpc', server.getRouter());
    probe.post('/echo', (context) => context.json({ ok: true }));

    const send = (path: string, name: string) => {
      return probe.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    };

    await send('/grpc/greeter.v1.GreeterService/SayHello', 'rpc-secret');
    await send('/echo', 'rest-body');
    const logged = JSON.stringify(captured);

    expect(logged).toContain('rest-body');
    expect(logged).toContain('<read by the route>');
    expect(logged).not.toContain('rpc-secret');
  });

  for (const messageSize of [0, -1, 1.5, Number.NaN]) {
    test(`messageSize ${messageSize} stops configure()`, async () => {
      const server = new GreeterController();
      server.service = GreeterService;
      server.limits = { messageSize };

      await RejectionUtility.expectRejection({
        task: server.configure(),
        message: /limits\.messageSize must be a positive integer/,
      });
    });
  }
});
