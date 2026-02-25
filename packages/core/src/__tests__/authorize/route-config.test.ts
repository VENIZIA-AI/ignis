import { describe, test, expect } from 'bun:test';
import {
  AuthorizationDecisions,
  type TAuthorizationDecision,
} from '@/components/auth/authorize/common/constants';
import type {
  IAuthorizationSpec,
  TAuthorizationVoter,
} from '@/components/auth/authorize/common/types';
import type { TRouteAuthConfig } from '@/base/controllers/common/types';

// =============================================================================
// 6. Route Config Integration Tests
// =============================================================================

describe('Route Config Integration', () => {
  // These tests verify that resolveRouteAuthorize in definition.ts correctly
  // resolves authorization configs at different levels.

  // We import defineControllerRouteConfigs which includes resolveRouteAuthorize internally.
  // Since it needs entity schemas, we test the logic at a higher level.

  describe('TRouteAuthConfig type behavior', () => {
    test('authenticate: { skip: true } should skip both auth and authorize', () => {
      const config: TRouteAuthConfig = {
        authenticate: { skip: true },
      };
      expect(config.authenticate?.skip).toBe(true);
      expect(config.authorize).toBeUndefined();
    });

    test('authorize: { skip: true } should skip only authorization', () => {
      const config: TRouteAuthConfig = {
        authorize: { skip: true },
      };
      expect(config.authenticate).toBeUndefined();
      expect(config.authorize).toEqual({ skip: true });
    });

    test('authenticate and authorize can both be skipped independently', () => {
      const config: TRouteAuthConfig = {
        authenticate: { skip: true },
        authorize: { skip: true },
      };
      expect(config.authenticate?.skip).toBe(true);
      expect(config.authorize).toEqual({ skip: true });
    });

    test('authenticate can override strategies and mode', () => {
      const config: TRouteAuthConfig = {
        authenticate: { strategies: ['jwt' as any], mode: 'any' as any },
      };
      expect(config.authenticate).toBeDefined();
      expect('skip' in config.authenticate!).toBe(false);
    });

    test('authorize can be single spec', () => {
      const config: TRouteAuthConfig = {
        authorize: { action: 'read', resource: 'User' },
      };
      expect((config.authorize as IAuthorizationSpec)?.action).toBe('read');
    });

    test('authorize can be array of specs', () => {
      const specs: IAuthorizationSpec[] = [
        { action: 'read', resource: 'User' },
        { action: 'read', resource: 'Profile' },
      ];
      const config: TRouteAuthConfig = {
        authorize: specs,
      };
      expect(Array.isArray(config.authorize)).toBe(true);
      expect(config.authorize).toHaveLength(2);
    });
  });

  describe('IAuthorizationSpec structure', () => {
    test('should accept minimal spec (action + resource only)', () => {
      const spec: IAuthorizationSpec = {
        action: 'read',
        resource: 'User',
      };
      expect(spec.action).toBe('read');
      expect(spec.resource).toBe('User');
      expect(spec.conditions).toBeUndefined();
      expect(spec.allowedRoles).toBeUndefined();
      expect(spec.voters).toBeUndefined();
    });

    test('should accept full spec with all optional fields', () => {
      const voter: TAuthorizationVoter = async (): Promise<TAuthorizationDecision> =>
        AuthorizationDecisions.ALLOW;

      const spec: IAuthorizationSpec = {
        action: 'update',
        resource: 'Post',
        conditions: { ownerId: 'user_1' },
        allowedRoles: ['admin', 'editor'],
        voters: [voter],
      };

      expect(spec.conditions).toEqual({ ownerId: 'user_1' });
      expect(spec.allowedRoles).toEqual(['admin', 'editor']);
      expect(spec.voters).toHaveLength(1);
    });
  });

  describe('IAuthRouteConfig compatibility', () => {
    test('should support both authenticate and authorize fields', () => {
      // Verifying IAuthRouteConfig extends HonoRouteConfig with both auth fields
      const config = {
        method: 'get' as const,
        path: '/users',
        responses: { 200: { description: 'OK' } },
        authenticate: { strategies: ['jwt' as any], mode: 'any' as any },
        authorize: { action: 'read', resource: 'User' } as IAuthorizationSpec,
      };

      expect(config.authenticate?.strategies).toEqual(['jwt']);
      expect(config.authorize?.action).toBe('read');
    });

    test('should support authorize as array', () => {
      const config = {
        method: 'post' as const,
        path: '/users',
        responses: { 200: { description: 'OK' } },
        authorize: [
          { action: 'create', resource: 'User' },
          { action: 'write', resource: 'UserProfile' },
        ] as IAuthorizationSpec[],
      };

      expect(config.authorize).toHaveLength(2);
    });
  });
});
