import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import * as connect from '@connectrpc/connect';
import * as protocol from '@connectrpc/connect/protocol';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { GRPC } from '@venizia/ignis-helpers/common';
import { Hono } from 'hono';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import { GrpcRequestAdapter } from '@/base/controllers/grpc/adapter';

/** `greeter.v1.GreeterService` with one unary method, `SayHello`: the descriptor `protoc-gen-es` writes. */
const GreeterService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIh8KD1NheUhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJIiMKEFNheUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTJXCg5HcmVldGVyU2VydmljZRJFCghTYXlIZWxsbxIbLmdyZWV0ZXIudjEuU2F5SGVsbG9SZXF1ZXN0GhwuZ3JlZXRlci52MS5TYXlIZWxsb1Jlc3BvbnNlYgZwcm90bzM',
  ),
  0,
);

/** A call whose ConnectRPC transport throws before the RPC handler runs. */
const call = async (opts: { env: string }) => {
  class GreeterController extends BaseGrpcController {
    override binding() {
      this.defineRoute({
        configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
        handler: () => ({}),
      });
    }
  }

  const controller = new GreeterController({ scope: 'GreeterController', path: '/grpc' });
  controller.service = GreeterService;
  await controller.configure();

  const adapter = await GrpcRequestAdapter.build({
    controller,
    module: {
      connect,
      protocol: {
        ...protocol,
        universalServerRequestFromFetch: () => {
          throw new Error('socket detail');
        },
      },
    },
  });
  const application = new Hono();
  application.use('*', adapter.middleware);

  const response = await application.request(
    '/grpc/greeter.v1.GreeterService/SayHello',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    { NODE_ENV: opts.env },
  );
  const body = await response.json();

  return { status: response.status, body, header: response.headers.get(GRPC.Headers.GRPC_MESSAGE) };
};

describe('a failing gRPC transport', () => {
  for (const env of ['production', 'staging']) {
    test(`answers the generic message in ${env}`, async () => {
      const result = await call({ env });

      expect(result.status).toBe(500);
      expect(result.body).toEqual({
        message: 'Internal Server Error',
        code: GRPC.ResultCodes.INTERNAL,
      });
      expect(result.header).toBe(encodeURIComponent('Internal Server Error'));
    });
  }

  test('answers the thrown message in development', async () => {
    const result = await call({ env: 'development' });

    expect(result.body).toHaveProperty('message', 'socket detail');
  });
});
