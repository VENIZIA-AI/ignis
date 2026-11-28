import 'reflect-metadata';
import { afterAll, describe, expect, test } from 'bun:test';
import * as connect from '@connectrpc/connect';
import * as protocol from '@connectrpc/connect/protocol';
import type { HandlerContext } from '@connectrpc/connect';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { GRPC, HTTP } from '@venizia/ignis-helpers/common';
import { PromiseUtility } from '@venizia/ignis-helpers/core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import { GrpcRequestAdapter } from '@/base/controllers/grpc/adapter';

/** `greeter.v1.GreeterService` with one unary method, `SayHello`: the descriptor `protoc-gen-es` writes. */
const GreeterService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIh8KD1NheUhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJIiMKEFNheUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTJXCg5HcmVldGVyU2VydmljZRJFCghTYXlIZWxsbxIbLmdyZWV0ZXIudjEuU2F5SGVsbG9SZXF1ZXN0GhwuZ3JlZXRlci52MS5TYXlIZWxsb1Jlc3BvbnNlYgZwcm90bzM',
  ),
  0,
);
const PATH = '/api/grpc/greeter.v1.GreeterService/SayHello';

const seen: { aborted: string[]; header?: string; contextHeader?: string; left?: number } = {
  aborted: [],
};

class GreeterController extends BaseGrpcController {
  override binding() {
    this.defineRoute({
      configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
      handler: async (opts) => {
        const rpc: HandlerContext = opts.rpc;
        const name = String(Reflect.get(Object(opts.request), 'name'));
        seen.header = rpc.requestHeader.get('x-tenant') ?? undefined;
        seen.contextHeader = opts.context.req.header('x-tenant');
        seen.left = rpc.timeoutMs();

        if (name === 'slow') {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 2_000);
            rpc.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              seen.aborted.push(connect.ConnectError.from(rpc.signal.reason).name);
              reject(rpc.signal.reason);
            });
          });
        }

        rpc.responseHeader.set('x-greeter', 'v2');
        rpc.responseTrailer.set('x-cost', '3');

        return { message: `hello ${name}` };
      },
    });
  }
}

const controller = new GreeterController({ scope: 'GreeterController', path: '/grpc' });
controller.service = GreeterService;
await controller.configure();

const application = new Hono();
application.use('*', requestId({ generator: () => 'rid-1' }));
application.use('*', cors({ origin: 'https://app.example' }));
application.route('/api/grpc', controller.getRouter());
const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: application.fetch });

afterAll(async () => {
  await server.stop(true);
});

const post = (opts: {
  body: string | Uint8Array<ArrayBuffer>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}) => {
  return fetch(`http://127.0.0.1:${server.port}${PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...opts.headers },
    body: opts.body,
    signal: opts.signal,
  });
};

describe('gRPC adapter on the wire', () => {
  test('headers of earlier middleware, response headers and trailers reach the client', async () => {
    const response = await post({ body: '{"name":"a"}', headers: { 'x-tenant': 't1' } });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ message: 'hello a' });
    expect(response.headers.get('x-request-id')).toBe('rid-1');
    expect(response.headers.get('x-greeter')).toBe('v2');
    expect(response.headers.get('trailer-x-cost')).toBe('3');
    expect(seen.header).toBe('t1');
    expect(seen.contextHeader).toBe('t1');
    expect(seen.left).toBeUndefined();
  });

  test('an error answer keeps the headers of earlier middleware', async () => {
    const response = await post({ body: '{bad' });

    expect(response.headers.get('x-request-id')).toBe('rid-1');
    const body = await response.json();
    expect(body).toHaveProperty('code', 'invalid_argument');
  });

  test('a gRPC-Web answer keeps them too', async () => {
    const response = await post({
      body: new Uint8Array(5),
      headers: { 'content-type': 'application/grpc-web+proto' },
    });
    await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('rid-1');
  });

  for (const contentType of ['application/grpc', 'application/grpc+proto']) {
    test(`${contentType} is refused with 415: native gRPC needs trailers`, async () => {
      const response = await post({
        body: new Uint8Array(5),
        headers: { 'content-type': contentType },
      });

      expect(response.status).toBe(HTTP.ResultCodes.RS_4.UnsupportedMediaType);
    });
  }

  test('a deadline aborts rpc.signal and answers deadline_exceeded', async () => {
    seen.aborted = [];
    const response = await post({
      body: '{"name":"slow"}',
      headers: { 'connect-timeout-ms': '50' },
    });

    const body = await response.json();
    expect(body).toHaveProperty('code', 'deadline_exceeded');
    expect(seen.aborted).toHaveLength(1);
    expect(seen.left).toBeLessThanOrEqual(50);
  });

  test('a client that leaves aborts rpc.signal', async () => {
    seen.aborted = [];
    const abort = new AbortController();
    // The client's own request rejects when it leaves: settled here so the rejection is expected.
    const pending = Promise.allSettled([post({ body: '{"name":"slow"}', signal: abort.signal })]);
    await PromiseUtility.sleep({ ms: 100 });
    abort.abort();
    await pending;
    await PromiseUtility.sleep({ ms: 100 });

    expect(seen.aborted).toHaveLength(1);
  });

  test('a CORS preflight on an RPC route is answered by the CORS middleware', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}${PATH}`, {
      method: 'OPTIONS',
      headers: { origin: 'https://app.example', 'access-control-request-method': 'POST' },
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.NoContent);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });

  test('a method the service does not implement is not served', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/grpc/greeter.v1.Other/X`, {
      method: 'POST',
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.NotFound);
  });

  test('another method on an RPC path is the application 404', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}${PATH}`, { method: 'DELETE' });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.NotFound);
  });

  test('the adapter answers a router and the paths it serves', async () => {
    const adapter = await GrpcRequestAdapter.build({ controller, module: { connect, protocol } });

    expect(adapter.paths).toEqual(['/greeter.v1.GreeterService/SayHello']);
    // Each route is the body marker and the call.
    const routed = new Set(adapter.router.routes.map((route) => route.path));
    expect([...routed]).toEqual(adapter.paths);
  });
});
