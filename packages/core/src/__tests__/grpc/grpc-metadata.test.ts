import 'reflect-metadata';
import { describe, test, expect, beforeEach } from 'bun:test';
import { MetadataRegistry } from '@/helpers/inversion/registry';
import { GRPC } from '@venizia/ignis-helpers/common';
import type { IRpcMetadata } from '@/helpers/inversion/common/types';

describe('GrpcControllerMetadataMixin', () => {
  const registry = MetadataRegistry.getInstance();

  beforeEach(() => {
    registry.clearAll();
  });

  describe('addRpc / getRpc', () => {
    test('should store unary RPC metadata', () => {
      class Ctrl1 {}
      const configs: IRpcMetadata = {
        name: 'sayHello',
        method: GRPC.Methods.UNARY,
      };

      registry.addRpc({
        target: Ctrl1.prototype,
        methodName: 'sayHello',
        configs,
      });

      const result = registry.getRpc({
        target: Ctrl1.prototype,
        methodName: 'sayHello',
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('sayHello');
      expect(result!.method).toBe('unary');
    });

    test('should store streaming RPC metadata', () => {
      class Ctrl2 {}
      const configs: IRpcMetadata = {
        name: 'streamMessages',
        method: GRPC.Methods.SERVER_STREAMING,
      };

      registry.addRpc({
        target: Ctrl2.prototype,
        methodName: 'streamMessages',
        configs,
      });

      const result = registry.getRpc({
        target: Ctrl2.prototype,
        methodName: 'streamMessages',
      });

      expect(result).toBeDefined();
      expect(result!.method).toBe('server_streaming');
    });

    test('should store RPC metadata with authenticate config', () => {
      class Ctrl3 {}
      const configs: IRpcMetadata = {
        name: 'secureMethod',
        method: GRPC.Methods.UNARY,
        authenticate: { strategies: ['jwt'], mode: 'any' },
      };

      registry.addRpc({
        target: Ctrl3.prototype,
        methodName: 'secureMethod',
        configs,
      });

      const result = registry.getRpc({
        target: Ctrl3.prototype,
        methodName: 'secureMethod',
      });

      expect(result).toBeDefined();
      expect(result!.authenticate?.strategies).toEqual(['jwt']);
      expect(result!.authenticate?.mode).toBe('any');
    });

    test('should store RPC metadata with authorize config', () => {
      class Ctrl4 {}
      const configs: IRpcMetadata = {
        name: 'authorizedMethod',
        method: GRPC.Methods.UNARY,
        authorize: { action: 'read', resource: 'users' },
      };

      registry.addRpc({
        target: Ctrl4.prototype,
        methodName: 'authorizedMethod',
        configs,
      });

      const result = registry.getRpc({
        target: Ctrl4.prototype,
        methodName: 'authorizedMethod',
      });

      expect(result).toBeDefined();
      expect(result!.authorize).toEqual({ action: 'read', resource: 'users' });
    });

    test('should store RPC metadata with authorize array config', () => {
      class Ctrl5 {}
      const configs: IRpcMetadata = {
        name: 'multiAuthMethod',
        method: GRPC.Methods.UNARY,
        authorize: [
          { action: 'read', resource: 'users' },
          { action: 'list', resource: 'users' },
        ],
      };

      registry.addRpc({
        target: Ctrl5.prototype,
        methodName: 'multiAuthMethod',
        configs,
      });

      const result = registry.getRpc({
        target: Ctrl5.prototype,
        methodName: 'multiAuthMethod',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result!.authorize)).toBe(true);
      if (Array.isArray(result!.authorize)) {
        expect(result!.authorize.length).toBe(2);
      }
    });

    test('should store RPC metadata with both authenticate and authorize', () => {
      class Ctrl6 {}
      const configs: IRpcMetadata = {
        name: 'fullySecuredMethod',
        method: GRPC.Methods.UNARY,
        authenticate: { strategies: ['jwt', 'basic'], mode: 'all' },
        authorize: { action: 'write', resource: 'orders', allowedRoles: ['admin'] },
      };

      registry.addRpc({
        target: Ctrl6.prototype,
        methodName: 'fullySecuredMethod',
        configs,
      });

      const result = registry.getRpc({
        target: Ctrl6.prototype,
        methodName: 'fullySecuredMethod',
      });

      expect(result).toBeDefined();
      expect(result!.authenticate?.strategies).toEqual(['jwt', 'basic']);
      expect(result!.authenticate?.mode).toBe('all');
      expect(result!.authorize).toEqual({
        action: 'write',
        resource: 'orders',
        allowedRoles: ['admin'],
      });
    });
  });

  describe('getRpcs', () => {
    test('should return all RPCs for a controller', () => {
      class MultiRpcCtrl {}

      registry.addRpc({
        target: MultiRpcCtrl.prototype,
        methodName: 'method1',
        configs: { name: 'Method1', method: GRPC.Methods.UNARY },
      });

      registry.addRpc({
        target: MultiRpcCtrl.prototype,
        methodName: 'method2',
        configs: { name: 'Method2', method: GRPC.Methods.SERVER_STREAMING },
      });

      const rpcs = registry.getRpcs({ target: MultiRpcCtrl.prototype });

      expect(rpcs).toBeDefined();
      expect(rpcs!.size).toBe(2);
      expect(rpcs!.has('method1')).toBe(true);
      expect(rpcs!.has('method2')).toBe(true);
    });

    test('should return undefined for class with no RPCs', () => {
      class EmptyController {}
      const rpcs = registry.getRpcs({ target: EmptyController.prototype });
      expect(rpcs).toBeUndefined();
    });
  });

  describe('hasRpcs', () => {
    test('should return true when RPCs exist', () => {
      class HasRpcsCtrl {}
      registry.addRpc({
        target: HasRpcsCtrl.prototype,
        methodName: 'someMethod',
        configs: { name: 'SomeMethod', method: GRPC.Methods.UNARY },
      });

      expect(registry.hasRpcs({ target: HasRpcsCtrl.prototype })).toBe(true);
    });

    test('should return false when no RPCs exist', () => {
      class NoRpcsCtrl {}
      expect(registry.hasRpcs({ target: NoRpcsCtrl.prototype })).toBe(false);
    });
  });
});
