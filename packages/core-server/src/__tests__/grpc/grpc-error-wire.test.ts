import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { GRPC, HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTPException } from 'hono/http-exception';
import { BaseGrpcController } from '@/base/controllers/grpc/base';

/** `greeter.v1.GreeterService` with one unary method, `SayHello`: the descriptor `protoc-gen-es` writes. */
const GreeterService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIh8KD1NheUhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJIiMKEFNheUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTJXCg5HcmVldGVyU2VydmljZRJFCghTYXlIZWxsbxIbLmdyZWV0ZXIudjEuU2F5SGVsbG9SZXF1ZXN0GhwuZ3JlZXRlci52MS5TYXlIZWxsb1Jlc3BvbnNlYgZwcm90bzM',
  ),
  0,
);

/** One real call through the adapter and the installed ConnectRPC: the HTTP status and the JSON body a client reads. */
const call = async (opts: { failure: unknown; env: string }) => {
  class GreeterController extends BaseGrpcController {
    override binding() {
      this.defineRoute({
        configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
        handler: () => {
          throw opts.failure;
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
      { NODE_ENV: opts.env },
    );

  const result = await response.json();

  return { status: response.status, body: result };
};

const INTERNAL = {
  status: HTTP.ResultCodes.RS_5.InternalServerError,
  body: { code: 'internal', message: 'internal error' },
};

describe.each(['production', 'development'])('gRPC errors on the wire - %s', (env) => {
  test('an IGNIS error answers its code and message', async () => {
    const failure = getError({ statusCode: 401, message: 'sign in first' });

    const result = await call({ failure, env });
    expect(result).toEqual({
      status: 401,
      body: { code: 'unauthenticated', message: 'sign in first' },
    });
  });

  test('a Hono HTTPException answers its code and message', async () => {
    const failure = new HTTPException(403, { message: 'not yours' });

    const result2 = await call({ failure, env });
    expect(result2).toEqual({
      status: 403,
      body: { code: 'permission_denied', message: 'not yours' },
    });
  });

  test('an error of another library that carries a statusCode stays internal', async () => {
    const failure = Object.assign(new Error('upstream said: token abc'), { statusCode: 401 });

    const result3 = await call({ failure, env });
    expect(result3).toEqual(INTERNAL);
  });

  test('any other error stays internal', async () => {
    const result4 = await call({ failure: new Error('connection string'), env });
    expect(result4).toEqual(INTERNAL);
  });

  test('an IGNIS server error stays internal', async () => {
    const failure = getError({ statusCode: 503, message: 'down' });

    const result5 = await call({ failure, env });
    expect(result5).toEqual(INTERNAL);
  });
});
