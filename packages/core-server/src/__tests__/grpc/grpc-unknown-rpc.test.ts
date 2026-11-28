import * as connect from '@connectrpc/connect';
import 'reflect-metadata';
import { describe, test } from 'bun:test';
import type { ConnectRouter } from '@connectrpc/connect';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { GRPC } from '@venizia/ignis-helpers/common';
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
