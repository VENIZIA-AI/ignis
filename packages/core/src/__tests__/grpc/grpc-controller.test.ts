import 'reflect-metadata';
import { describe, test, expect, beforeEach } from 'bun:test';
import { MetadataRegistry } from '@/helpers/inversion/registry';
import { ControllerTransports } from '@/base/controllers/common/constants';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import type { IConnectRpcModule } from '@/base/controllers/grpc/common/types';
import type { AnyType } from '@venizia/ignis-helpers';
import { GRPC } from '@venizia/ignis-helpers';
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
        createConnectRouter: opts => {
          calls.push('createConnectRouter');
          routerOpts.push(opts);
          return { service: () => calls.push('service'), handlers: [] } as AnyType;
        },
      },
      protocol: {
        universalServerRequestFromFetch: (() => ({})) as AnyType,
        universalServerResponseToFetch: (() => new Response()) as AnyType,
      },
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
    ctrl.service = {} as AnyType;
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
        createConnectRouter: opts => {
          routerOpts.push(opts);
          return { service: () => {}, handlers: [] } as AnyType;
        },
      },
      protocol: {
        universalServerRequestFromFetch: (() => ({})) as AnyType,
        universalServerResponseToFetch: (() => new Response()) as AnyType,
      },
    };

    await ctrl.configure();

    return routerOpts[0];
  };

  test('reaches createConnectRouter', async () => {
    const first = () => {};
    const second = () => {};

    expect(await buildController([first, second])).toEqual({ interceptors: [first, second] });
  });

  test('an empty list passes no router option', async () => {
    expect(await buildController([])).toEqual({});
  });

  test('no interceptors passes no router option', async () => {
    expect(await buildController()).toEqual({});
  });
});
