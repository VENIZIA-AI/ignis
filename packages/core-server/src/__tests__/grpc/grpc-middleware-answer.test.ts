import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { GRPC, HTTP } from '@venizia/ignis-helpers/common';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import type { TRpcMiddleware } from '@/base/controllers/grpc/common/types';

/** `greeter.v1.GreeterService` with one unary method, `SayHello`: the descriptor `protoc-gen-es` writes. */
const GreeterService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIh8KD1NheUhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJIiMKEFNheUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTJXCg5HcmVldGVyU2VydmljZRJFCghTYXlIZWxsbxIbLmdyZWV0ZXIudjEuU2F5SGVsbG9SZXF1ZXN0GhwuZ3JlZXRlci52MS5TYXlIZWxsb1Jlc3BvbnNlYgZwcm90bzM',
  ),
  0,
);

/** One real call through a controller whose RPC runs `middlewares` before its handler. */
const call = async (middlewares: TRpcMiddleware[]) => {
  const ran: string[] = [];

  class GreeterController extends BaseGrpcController {
    override buildRpcMiddlewares() {
      return middlewares;
    }

    override binding() {
      this.defineRoute({
        configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
        handler: () => {
          ran.push('handler');

          return { message: 'hello' };
        },
      });
    }
  }

  const controller = new GreeterController({ scope: 'GreeterController', path: '/grpc' });
  controller.service = GreeterService;
  await controller.configure();

  const response = await controller
    .getRouter()
    .request(
      '/greeter.v1.GreeterService/SayHello',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"a"}' },
      { NODE_ENV: 'production' },
    );
  const body = await response.json();

  return { status: response.status, body, ran };
};

const answering = (status: number): TRpcMiddleware => {
  return () => new Response('from the middleware', { status });
};

const passing: TRpcMiddleware = async (_context, next) => {
  await next();
};

describe('gRPC adapter - a middleware ends a call it does not pass on', () => {
  test('a 4xx answer ends it with the code of the status; the handler does not run', async () => {
    const result = await call([answering(HTTP.ResultCodes.RS_4.Forbidden)]);

    expect(result).toEqual({
      status: 403,
      body: { code: 'permission_denied', message: 'A middleware ended the call' },
      ran: [],
    });
  });

  test('any other answer ends it as internal', async () => {
    const result = await call([answering(HTTP.ResultCodes.RS_2.Ok)]);

    expect(result).toEqual({
      status: 500,
      body: { code: 'internal', message: 'internal error' },
      ran: [],
    });
  });

  test('a later middleware does not run either', async () => {
    const later: string[] = [];
    const result = await call([
      answering(HTTP.ResultCodes.RS_4.Unauthorized),
      () => {
        later.push('later');
      },
    ]);

    expect(result.status).toBe(401);
    expect(later).toEqual([]);
  });

  test('a middleware that does not call next() ends it as internal; the handler does not run', async () => {
    const later: string[] = [];
    const result = await call([
      () => {},
      () => {
        later.push('later');
      },
    ]);

    expect(result).toEqual({
      status: 500,
      body: { code: 'internal', message: 'internal error' },
      ran: [],
    });
    expect(later).toEqual([]);
  });

  test('a middleware that calls next() lets the handler run', async () => {
    const result = await call([passing]);

    expect(result).toEqual({ status: 200, body: { message: 'hello' }, ran: ['handler'] });
  });
});
