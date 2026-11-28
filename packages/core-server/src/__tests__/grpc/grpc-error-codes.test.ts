import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import * as connect from '@connectrpc/connect';
import type { ConnectRouter } from '@connectrpc/connect';
import type { UniversalHandler, UniversalServerRequest } from '@connectrpc/connect/protocol';
import { GRPC, HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import type { IConnectRpcModule } from '@/base/controllers/grpc/common/types';

/**
 * Runs one unary call through the controller's adapter and answers what the RPC handler ConnectRPC holds threw:
 * ConnectRPC turns that into the wire answer, keeping the code and message of a `ConnectError` and hiding anything else
 * behind `internal`.
 */
const thrownBy = async (opts: { failure: () => never; env: string }): Promise<unknown> => {
  let implementation: object = {};
  let thrown: unknown;

  const fake = Object.assign(
    async (request: UniversalServerRequest) => {
      try {
        const sayHello: unknown = Reflect.get(implementation, 'sayHello');

        if (typeof sayHello === 'function') {
          await sayHello({}, { values: request.contextValues });
        }
      } catch (error) {
        thrown = error;
      }

      return { status: 200 };
    },
    {
      requestPath: '/probe',
      supportedContentType: () => true,
      protocolNames: [],
      allowedMethods: ['POST'],
      service: { typeName: 'probe' },
      method: { name: 'SayHello' },
    },
  );
  // Only the members the adapter reads; the rest of a handler is ConnectRPC's.
  const call = fake as unknown as UniversalHandler;
  const router: ConnectRouter = {
    handlers: [call],
    service(_service: unknown, value: object) {
      implementation = value;

      return this;
    },
    rpc() {
      return this;
    },
  };
  const module: IConnectRpcModule = {
    connect: Object.assign(
      {
        createConnectRouter: () => router,
        createContextKey: connect.createContextKey,
        createContextValues: connect.createContextValues,
      },
      { ConnectError: connect.ConnectError },
    ),
    protocol: {
      universalServerRequestFromFetch: () => ({
        httpVersion: '1.1',
        url: 'http://localhost/grpc/probe',
        method: 'POST',
        header: new Headers(),
        body: {},
        signal: new AbortController().signal,
      }),
      universalServerResponseToFetch: () => new Response(),
    },
  };

  class ProbeController extends BaseGrpcController {
    override binding() {
      this.defineRoute({
        configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
        handler: opts.failure,
      });
    }
  }

  const controller = new ProbeController({ scope: 'ProbeController', path: '/grpc' });
  controller.service = {};
  controller.connectRpcModule = module;
  await controller.configure();
  await controller.getRouter().request('/probe', { method: 'POST' }, { NODE_ENV: opts.env });

  return thrown;
};

const failWith = (statusCode: number, message: string) => () => {
  throw getError({ statusCode, message });
};

describe('gRPC adapter - the code a client error is answered with', () => {
  const rows = [
    { status: HTTP.ResultCodes.RS_4.BadRequest, code: GRPC.ResultCodes.INVALID_ARGUMENT },
    { status: HTTP.ResultCodes.RS_4.UnprocessableEntity, code: GRPC.ResultCodes.INVALID_ARGUMENT },
    { status: HTTP.ResultCodes.RS_4.Unauthorized, code: GRPC.ResultCodes.UNAUTHENTICATED },
    { status: HTTP.ResultCodes.RS_4.Forbidden, code: GRPC.ResultCodes.PERMISSION_DENIED },
    { status: HTTP.ResultCodes.RS_4.NotFound, code: GRPC.ResultCodes.NOT_FOUND },
    { status: HTTP.ResultCodes.RS_4.Conflict, code: GRPC.ResultCodes.ABORTED },
    { status: HTTP.ResultCodes.RS_4.TooManyRequests, code: GRPC.ResultCodes.RESOURCE_EXHAUSTED },
    { status: HTTP.ResultCodes.RS_4.Gone, code: GRPC.ResultCodes.FAILED_PRECONDITION },
  ];

  test.each(rows)('$status answers gRPC code $code with the public message', async (row) => {
    const thrown = await thrownBy({
      failure: failWith(row.status, 'told to the caller'),
      env: 'production',
    });

    expect(thrown).toBeInstanceOf(connect.ConnectError);
    expect(thrown).toMatchObject({ code: row.code, rawMessage: 'told to the caller' });
  });

  test('an error that is not the caller’s fault is passed on as it is, for ConnectRPC to hide', async () => {
    const failure = new Error('connection string');
    const thrown = await thrownBy({
      failure: () => {
        throw failure;
      },
      env: 'production',
    });

    expect(thrown).toBe(failure);
  });

  test('a server error with a status of its own stays as it is', async () => {
    const thrown = await thrownBy({
      failure: failWith(HTTP.ResultCodes.RS_5.ServiceUnavailable, 'down'),
      env: 'production',
    });

    expect(thrown).not.toBeInstanceOf(connect.ConnectError);
  });

  test('a ConnectError the application threw keeps its own code', async () => {
    const failure = new connect.ConnectError('mine', connect.Code.AlreadyExists);
    const thrown = await thrownBy({
      failure: () => {
        throw failure;
      },
      env: 'production',
    });

    expect(thrown).toBe(failure);
  });
});
