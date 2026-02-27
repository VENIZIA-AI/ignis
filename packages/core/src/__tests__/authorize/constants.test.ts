import { describe, test, expect } from 'bun:test';
import {
  Authorization,
  AuthorizationActions,
  AuthorizationDecisions,
} from '@/components/auth/authorize/common/constants';
import { AuthorizeBindingKeys } from '@/components/auth/authorize/common/keys';

describe('Authorization Constants', () => {
  describe('AuthorizationActions', () => {
    test('should define all standard CRUD actions', () => {
      expect(AuthorizationActions.CREATE).toBe('create');
      expect(AuthorizationActions.READ).toBe('read');
      expect(AuthorizationActions.UPDATE).toBe('update');
      expect(AuthorizationActions.DELETE).toBe('delete');
      expect(AuthorizationActions.EXECUTE).toBe('execute');
    });

    test('should validate known actions', () => {
      expect(AuthorizationActions.isValid('create')).toBe(true);
      expect(AuthorizationActions.isValid('read')).toBe(true);
      expect(AuthorizationActions.isValid('update')).toBe(true);
      expect(AuthorizationActions.isValid('delete')).toBe(true);
      expect(AuthorizationActions.isValid('execute')).toBe(true);
    });

    test('should reject unknown actions', () => {
      expect(AuthorizationActions.isValid('unknown')).toBe(false);
      expect(AuthorizationActions.isValid('')).toBe(false);
      expect(AuthorizationActions.isValid('CREATE')).toBe(false);
      expect(AuthorizationActions.isValid('manage')).toBe(false);
    });

    test('should have correct SCHEME_SET size', () => {
      expect(AuthorizationActions.SCHEME_SET.size).toBe(5);
    });

    test('should reject whitespace-only actions', () => {
      expect(AuthorizationActions.isValid(' ')).toBe(false);
      expect(AuthorizationActions.isValid('\t')).toBe(false);
      expect(AuthorizationActions.isValid('\n')).toBe(false);
    });

    test('should reject actions with leading/trailing spaces', () => {
      expect(AuthorizationActions.isValid(' create')).toBe(false);
      expect(AuthorizationActions.isValid('create ')).toBe(false);
      expect(AuthorizationActions.isValid(' create ')).toBe(false);
    });
  });

  describe('AuthorizationDecisions', () => {
    test('should define all decision types', () => {
      expect(AuthorizationDecisions.ALLOW).toBe('allow');
      expect(AuthorizationDecisions.DENY).toBe('deny');
      expect(AuthorizationDecisions.ABSTAIN).toBe('abstain');
    });

    test('should validate known decisions', () => {
      expect(AuthorizationDecisions.isValid('allow')).toBe(true);
      expect(AuthorizationDecisions.isValid('deny')).toBe(true);
      expect(AuthorizationDecisions.isValid('abstain')).toBe(true);
    });

    test('should reject unknown decisions', () => {
      expect(AuthorizationDecisions.isValid('reject')).toBe(false);
      expect(AuthorizationDecisions.isValid('')).toBe(false);
    });

    test('should have correct SCHEME_SET size', () => {
      expect(AuthorizationDecisions.SCHEME_SET.size).toBe(3);
    });
  });

  describe('Authorization context keys', () => {
    test('should define context keys', () => {
      expect(Authorization.RULES).toBe('authorization.rules');
      expect(Authorization.SKIP_AUTHORIZATION).toBe('authorization.skip');
      expect(Authorization.ENFORCER).toBe('authorization.enforcer');
    });
  });

  describe('AuthorizeBindingKeys', () => {
    test('should define all binding keys', () => {
      expect(AuthorizeBindingKeys.OPTIONS).toBe('@app/authorize/options');
      expect(AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES).toBe('@app/authorize/always-allow-roles');
    });
  });
});
