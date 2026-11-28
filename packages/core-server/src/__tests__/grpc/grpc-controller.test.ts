import * as connect from '@connectrpc/connect';
import 'reflect-metadata';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModuleUtility } from '@venizia/ignis-helpers';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import type { IConnectRpcModule } from '@/base/controllers/grpc/common/types';
import { GRPC } from '@venizia/ignis-helpers/common';
import type { ConnectRouter } from '@connectrpc/connect';
import type { UniversalHandler } from '@connectrpc/connect/protocol';

/** A router that only records that a service was registered on it. */
class FakeConnectRouter implements ConnectRouter {
  readonly handlers: UniversalHandler[] = [];

  constructor(private readonly calls: string[] = []) {}

  service = (): this => {
    this.calls.push('service');

    return this;
  };

  rpc = (): this => this;
}

/** The two protocol conversions the adapter holds on to; neither runs during `configure()`. */
const buildFakeProtocol = (): IConnectRpcModule['protocol'] => ({
  universalServerRequestFromFetch: () => ({
    httpVersion: '1.1',
    url: 'http://localhost/grpc',
    method: 'POST',
    header: new Headers(),
    body: {},
    signal: new AbortController().signal,
  }),
  universalServerResponseToFetch: () => new Response(),
});

describe('BaseGrpcController', () => {
  const registry = MetadataRegistry.getInstance();

  beforeEach(() => {
    registry.clearAll();
  });

  test('should resolve path from constructor', () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {}
    }

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc/test' });
    expect(ctrl.path).toBe('/grpc/test');
  });

  test('should resolve path from decorator metadata', () => {
    class DecoratedCtrl extends BaseGrpcController {
      async binding() {}
    }

    registry.setControllerMetadata({
      target: DecoratedCtrl,
      metadata: {
        path: '/grpc/decorated',
        transport: ControllerTransports.GRPC,
        service: {},
      },
    });

    const ctrl = new DecoratedCtrl({ scope: 'DecoratedCtrl' });
    expect(ctrl.path).toBe('/grpc/decorated');
    expect(ctrl.service).toBeDefined();
  });

  test('should throw when no path is provided', () => {
    class NoPathCtrl extends BaseGrpcController {
      async binding() {}
    }

    expect(() => new NoPathCtrl({ scope: 'NoPathCtrl' })).toThrow();
  });

  test('each controller should have its own OpenAPIHono router', () => {
    class Ctrl1 extends BaseGrpcController {
      async binding() {}
    }
    class Ctrl2 extends BaseGrpcController {
      async binding() {}
    }

    const ctrl1 = new Ctrl1({ scope: 'Ctrl1', path: '/grpc/1' });
    const ctrl2 = new Ctrl2({ scope: 'Ctrl2', path: '/grpc/2' });

    expect(ctrl1.router).toBeDefined();
    expect(ctrl2.router).toBeDefined();
    expect(ctrl1.router).not.toBe(ctrl2.router);
  });

  test('getRouter should return the sub-router', () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {}
    }

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
    expect(ctrl.getRouter()).toBe(ctrl.router);
  });

  describe('defineRoute', () => {
    test('should register an implementation handler and track definition', async () => {
      class TestCtrl extends BaseGrpcController {
        async binding() {
          this.defineRoute({
            configs: { name: 'SayHello', method: GRPC.Methods.UNARY },
            handler: () => ({ message: `Hello!` }),
          });
        }
      }

      const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
      await ctrl['binding']();

      expect(ctrl.definitions['SayHello']).toBeDefined();
      expect(typeof ctrl.definitions['SayHello'].handler).toBe('function');
      expect(ctrl.definitions['SayHello'].configs.method).toBe('unary');
    });

    test('should register handler with full IRpcMetadata including authenticate and authorize', async () => {
      class TestCtrl extends BaseGrpcController {
        async binding() {
          this.defineRoute({
            configs: {
              name: 'SecureMethod',
              method: GRPC.Methods.UNARY,
              authenticate: { strategies: ['jwt'], mode: 'all' },
              authorize: { action: 'read', resource: 'users' },
            },
            handler: () => ({}),
          });
        }
      }

      const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
      await ctrl['binding']();

      const def = ctrl.definitions['SecureMethod'].configs;
      expect(def.authenticate?.strategies).toEqual(['jwt']);
      expect(def.authorize).toEqual({ action: 'read', resource: 'users' });
    });
  });

  describe('bindRoute', () => {
    test('should register handler via fluent API', async () => {
      class TestCtrl extends BaseGrpcController {
        async binding() {
          this.bindRoute({
            configs: { name: 'GetUser', method: GRPC.Methods.UNARY },
          }).to({
            handler: () => ({ user: 'test' }),
          });
        }
      }

      const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
      await ctrl['binding']();

      expect(ctrl.definitions['GetUser']).toBeDefined();
      expect(typeof ctrl.definitions['GetUser'].handler).toBe('function');
      expect(ctrl.definitions['GetUser'].configs.name).toBe('GetUser');
    });

    test('should return configs from fluent API', async () => {
      class TestCtrl extends BaseGrpcController {
        async binding() {
          const binding = this.bindRoute({
            configs: { name: 'ListUsers', method: GRPC.Methods.UNARY },
          });

          expect(binding.configs.name).toBe('ListUsers');
          expect(binding.configs.method).toBe('unary');

          const result = binding.to({ handler: () => ({}) });
          expect(result.configs.name).toBe('ListUsers');
        }
      }

      const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
      await ctrl['binding']();
    });

    test('should throw on non-unary streaming methods', () => {
      class TestCtrl extends BaseGrpcController {
        async binding() {
          this.bindRoute({
            configs: { name: 'StreamMethod', method: GRPC.Methods.SERVER_STREAMING },
          }).to({ handler: () => ({}) });
        }
      }

      const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
      expect(() => ctrl['binding']()).toThrow('Only unary RPCs are supported');
    });
  });

  test('should warn when overwriting an RPC with the same name', async () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {
        this.defineRoute({
          configs: { name: 'Duplicate', method: GRPC.Methods.UNARY },
          handler: () => ({ first: true }),
        });
        this.defineRoute({
          configs: { name: 'Duplicate', method: GRPC.Methods.UNARY },
          handler: () => ({ second: true }),
        });
      }
    }

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
    await ctrl['binding']();

    // Second handler should overwrite first
    expect(ctrl.definitions['Duplicate']).toBeDefined();
    expect(typeof ctrl.definitions['Duplicate'].handler).toBe('function');
  });

  test('registerRpcsFromRegistry should route through bindRoute', () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {}

      async myRpcMethod(opts: any) {
        return { result: opts.request.input };
      }
    }

    registry.addRpc({
      target: TestCtrl.prototype,
      methodName: 'myRpcMethod',
      configs: { name: 'MyRpc', method: GRPC.Methods.UNARY },
    });

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
    ctrl['registerRpcsFromRegistry']();

    expect(ctrl.definitions['MyRpc']).toBeDefined();
    expect(typeof ctrl.definitions['MyRpc'].handler).toBe('function');
    expect(ctrl.definitions['MyRpc'].configs.method).toBe('unary');
  });

  test('configure should call binding and registerRpcsFromRegistry', async () => {
    let hasCalledBinding = false;

    class TestCtrl extends BaseGrpcController {
      async binding() {
        hasCalledBinding = true;
        this.defineRoute({
          configs: { name: 'ImperativeMethod', method: GRPC.Methods.UNARY },
          handler: () => ({}),
        });
      }

      async decoratedMethod() {
        return {};
      }
    }

    registry.addRpc({
      target: TestCtrl.prototype,
      methodName: 'decoratedMethod',
      configs: { name: 'DecoratedMethod', method: GRPC.Methods.UNARY },
    });

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });

    // configure calls GrpcRequestAdapter.build, which requires @connectrpc/connect, so binding and registerRpcsFromRegistry are tested directly.
    await ctrl['binding']();
    ctrl['registerRpcsFromRegistry']();

    expect(hasCalledBinding).toBe(true);

    expect(ctrl.definitions['ImperativeMethod']).toBeDefined();
    expect(typeof ctrl.definitions['ImperativeMethod'].handler).toBe('function');
    expect(ctrl.definitions['DecoratedMethod']).toBeDefined();
    expect(typeof ctrl.definitions['DecoratedMethod'].handler).toBe('function');
  });

  test('configure should be idempotent', async () => {
    let callCount = 0;

    class TestCtrl extends BaseGrpcController {
      async binding() {
        callCount++;
      }
    }

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });

    // First configure: binding runs
    await ctrl['binding']();
    ctrl.isConfigured = true;

    // Second configure should be skipped
    await ctrl.configure();

    expect(callCount).toBe(1);
  });

  test('definitions should be empty initially', () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {}
    }

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
    expect(ctrl.definitions).toEqual({});
  });

  test('definitions should contain both configs and handler for each registered RPC', async () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {
        this.defineRoute({
          configs: { name: 'Method1', method: GRPC.Methods.UNARY },
          handler: () => ({}),
        });
        this.defineRoute({
          configs: { name: 'Method2', method: GRPC.Methods.UNARY },
          handler: () => ({}),
        });
      }
    }

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
    await ctrl['binding']();

    expect(Object.keys(ctrl.definitions)).toEqual(['Method1', 'Method2']);
    expect(ctrl.definitions['Method1'].configs.method).toBe('unary');
    expect(typeof ctrl.definitions['Method1'].handler).toBe('function');
  });
});

// A compiled binary has no node_modules for the adapter's createRequire to resolve against, so the
// application hands the peer over instead. Reaching the fake proves the handed-over module is what
// gets used - the same path such a binary takes.
describe('BaseGrpcController - ConnectRPC module handed over through the options', () => {
  const buildFakeModule = () => {
    const calls: string[] = [];
    const routerOpts: Array<Record<string, unknown> | undefined> = [];
    const module: IConnectRpcModule = {
      connect: {
        createContextKey: connect.createContextKey,
        createContextValues: connect.createContextValues,
        createConnectRouter: (opts) => {
          calls.push('createConnectRouter');
          routerOpts.push(opts);

          return new FakeConnectRouter(calls);
        },
      },
      protocol: buildFakeProtocol(),
    };

    return { module, calls, routerOpts };
  };

  test('the given module builds the router, no filesystem lookup', async () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {
        this.defineRoute({
          configs: { name: 'Method1', method: GRPC.Methods.UNARY },
          handler: () => ({}),
        });
      }
    }

    const { module, calls } = buildFakeModule();
    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
    ctrl.service = {};
    ctrl.connectRpcModule = module;

    await ctrl.configure();

    expect(calls).toEqual(['createConnectRouter', 'service']);
    expect(ctrl.isConfigured).toBe(true);
  });

  test('a controller with no module still resolves the peer itself', async () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {}
    }

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
    await ctrl.configure();

    expect(ctrl.isConfigured).toBe(true);
  });
});

describe('BaseGrpcController - interceptors from the component options', () => {
  const buildController = async (interceptors?: unknown[]) => {
    class TestCtrl extends BaseGrpcController {
      async binding() {}
    }

    const routerOpts: Array<Record<string, unknown> | undefined> = [];
    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });

    ctrl.interceptors = interceptors;
    ctrl.connectRpcModule = {
      connect: {
        createContextKey: connect.createContextKey,
        createContextValues: connect.createContextValues,
        createConnectRouter: (opts) => {
          routerOpts.push(opts);

          return new FakeConnectRouter();
        },
      },
      protocol: buildFakeProtocol(),
    };

    await ctrl.configure();

    return routerOpts[0];
  };

  test('reaches createConnectRouter', async () => {
    const first = () => {};

    const second = () => {};

    const result = await buildController([first, second]);
    expect(result).toEqual({ grpc: false, interceptors: [first, second] });
  });

  test('an empty list passes no interceptors', async () => {
    const result = await buildController([]);
    expect(result).toEqual({ grpc: false });
  });

  test('no interceptors passes none', async () => {
    const result = await buildController();
    expect(result).toEqual({ grpc: false });
  });
});

// The adapter loads its peers with `ModuleUtility.load`, so a peer the application registered satisfies it: the
// same path as a compiled binary, with no `node_modules` to resolve against. The project root points at an empty
// folder, where the old `createRequire` lookup found nothing.
describe('BaseGrpcController - ConnectRPC peers registered through ModuleUtility', () => {
  const PEERS = ['@connectrpc/connect', '@connectrpc/connect/protocol'];
  const root = mkdtempSync(join(tmpdir(), 'ignis-grpc-peers-'));

  afterEach(() => {
    ModuleUtility.setProjectRoot({ projectRoot: process.cwd() });
    const registry: Map<string, unknown> = Reflect.get(
      globalThis,
      Symbol.for('ignis:module-registry'),
    );

    for (const peer of PEERS) {
      registry.delete(peer);
    }
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('registered peers build the router when the project root holds no node_modules', async () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {
        this.defineRoute({
          configs: { name: 'Method1', method: GRPC.Methods.UNARY },
          handler: () => ({}),
        });
      }
    }

    const calls: string[] = [];
    ModuleUtility.setProjectRoot({ projectRoot: root });
    ModuleUtility.register({
      modules: {
        '@connectrpc/connect': {
          createContextKey: connect.createContextKey,
          createContextValues: connect.createContextValues,
          createConnectRouter: () => {
            calls.push('createConnectRouter');

            return new FakeConnectRouter(calls);
          },
        },
        '@connectrpc/connect/protocol': buildFakeProtocol(),
      },
    });

    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
    ctrl.service = {};
    await ctrl.configure();

    expect(calls).toEqual(['createConnectRouter', 'service']);
    expect(ctrl.isConfigured).toBe(true);
  });

  test('with nothing registered and no node_modules, the error names the peer to install', async () => {
    class TestCtrl extends BaseGrpcController {
      async binding() {}
    }

    ModuleUtility.setProjectRoot({ projectRoot: root });
    const ctrl = new TestCtrl({ scope: 'TestCtrl', path: '/grpc' });
    let error: unknown;

    try {
      await ctrl.configure();
    } catch (caught) {
      error = caught;
    }

    expect(String(error)).toContain("Please install '@connectrpc/connect'");
  });
});
