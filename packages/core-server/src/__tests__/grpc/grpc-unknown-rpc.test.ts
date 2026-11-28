import * as connect from '@connectrpc/connect';
import 'reflect-metadata';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { describe, test } from 'bun:test';
import type { ConnectRouter } from '@connectrpc/connect';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { GRPC, type TGrpcMethod } from '@venizia/ignis-helpers/common';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import type { IConnectRpcModule } from '@/base/controllers/grpc/common/types';

const buildModule = (): IConnectRpcModule => {
  const router: ConnectRouter = {
    handlers: [],
    service() {
      return this;
    },
    rpc() {
      return this;
    },
  };

  return {
    connect: {
      createConnectRouter: () => router,
      createContextKey: connect.createContextKey,
      createContextValues: connect.createContextValues,
    },
    protocol: {
      universalServerRequestFromFetch: () => ({
        httpVersion: '1.1',
        url: 'http://localhost/grpc',
        method: 'POST',
        header: new Headers(),
        body: {},
        signal: new AbortController().signal,
      }),
      universalServerResponseToFetch: () => new Response(),
    },
  };
};

/** Configures a controller of a service that declares `sayHello` and `sayBye`, with one RPC registered under `name`. */
const configureWith = async (opts: { name: string; service: object }) => {
  class ProbeController extends BaseGrpcController {
    override binding() {
      this.defineRoute({
        configs: { name: opts.name, method: GRPC.Methods.UNARY },
        handler: () => ({}),
      });
    }
  }

  const controller = new ProbeController({ scope: 'ProbeController', path: '/grpc' });
  controller.service = opts.service;
  controller.connectRpcModule = buildModule();

  await controller.configure();
};

const SERVICE = {
  typeName: 'probe.Greeter',
  methods: [{ localName: 'sayHello' }, { localName: 'sayBye' }],
};

describe('gRPC controller - an RPC name the service does not declare', () => {
  test('stops configure(), naming the service, the name and the declared ones', async () => {
    await RejectionUtility.expectRejection({
      task: configureWith({ name: 'sayHelo', service: SERVICE }),
      message:
        /\[ProbeController\] probe\.Greeter declares no RPC "sayHelo" \| declared: sayHello, sayBye/,
    });
  });

  test('a declared name configures, and a method nobody implements is allowed', async () => {
    await configureWith({ name: 'sayHello', service: SERVICE });
  });

  test('a service that lists no methods is not checked', async () => {
    await configureWith({ name: 'anything', service: {} });
  });
});

/** `greeter.v1.GreeterService`: unary `SayHello`, `ListHellos` (server), `Collect` (client), `Chat` (bidi). */
const StreamingService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIi4KDEhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJEhAKCHNsZWVwX21zGAIgASgFIiAKDUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTKZAgoOR3JlZXRlclNlcnZpY2USPwoIU2F5SGVsbG8SGC5ncmVldGVyLnYxLkhlbGxvUmVxdWVzdBoZLmdyZWV0ZXIudjEuSGVsbG9SZXNwb25zZRJDCgpMaXN0SGVsbG9zEhguZ3JlZXRlci52MS5IZWxsb1JlcXVlc3QaGS5ncmVldGVyLnYxLkhlbGxvUmVzcG9uc2UwARJACgdDb2xsZWN0EhguZ3JlZXRlci52MS5IZWxsb1JlcXVlc3QaGS5ncmVldGVyLnYxLkhlbGxvUmVzcG9uc2UoARI/CgRDaGF0EhguZ3JlZXRlci52MS5IZWxsb1JlcXVlc3QaGS5ncmVldGVyLnYxLkhlbGxvUmVzcG9uc2UoATABYgZwcm90bzM',
  ),
  0,
);

const KINDS = [
  { name: 'sayHello', kind: GRPC.Methods.UNARY, decorator: '@unary' },
  { name: 'listHellos', kind: GRPC.Methods.SERVER_STREAMING, decorator: '@serverStream' },
  { name: 'collect', kind: GRPC.Methods.CLIENT_STREAMING, decorator: '@clientStream' },
  { name: 'chat', kind: GRPC.Methods.BIDI_STREAMING, decorator: '@bidiStream' },
];

/** Configures a controller that declares one RPC of the service as `method`. */
const declare = async (opts: { name: string; method: TGrpcMethod }) => {
  class KindController extends BaseGrpcController {
    override binding() {
      this.defineRoute({ configs: opts, handler: () => ({}) });
    }
  }

  const controller = new KindController({ scope: 'KindController', path: '/grpc' });
  controller.service = StreamingService;
  await controller.configure();
};

describe('gRPC controller - an RPC declared as another kind than the service says', () => {
  for (const rpc of KINDS) {
    for (const other of KINDS) {
      if (other.kind === rpc.kind) {
        test(`${rpc.name} declared ${rpc.kind} configures`, async () => {
          await declare({ name: rpc.name, method: rpc.kind });
        });
        continue;
      }

      test(`${rpc.name} declared ${other.kind} stops configure()`, async () => {
        await RejectionUtility.expectRejection({
          task: declare({ name: rpc.name, method: other.kind }),
          message: new RegExp(
            `greeter\\.v1\\.GreeterService\\.${rpc.name} is ${rpc.kind}, declared ${other.kind} \\| declare it with ${rpc.decorator}`,
          ),
        });
      });
    }
  }
});
