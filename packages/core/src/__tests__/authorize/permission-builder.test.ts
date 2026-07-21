import { describe, expect, test } from 'bun:test';
import { AuthorizationActions } from '@/components/auth/authorize/common/constants';
import { AuthorizationPermissionBuilder } from '@/components/auth/authorize/builders/permission.builder';

const SCOPE = 'SYSTEM';

describe('AuthorizationPermissionBuilder.actionForMethod', () => {
  test('maps standard CRUD methods to base actions', () => {
    expect(AuthorizationPermissionBuilder.actionForMethod('find')).toBe(AuthorizationActions.READ);
    expect(AuthorizationPermissionBuilder.actionForMethod('count')).toBe(AuthorizationActions.READ);
    expect(AuthorizationPermissionBuilder.actionForMethod('create')).toBe(
      AuthorizationActions.CREATE,
    );
    expect(AuthorizationPermissionBuilder.actionForMethod('updateById')).toBe(
      AuthorizationActions.UPDATE,
    );
    expect(AuthorizationPermissionBuilder.actionForMethod('deleteBy')).toBe(
      AuthorizationActions.DELETE,
    );
  });

  test('custom (non-CRUD) methods default to execute', () => {
    expect(AuthorizationPermissionBuilder.actionForMethod('refund')).toBe(
      AuthorizationActions.EXECUTE,
    );
    expect(AuthorizationPermissionBuilder.actionForMethod('launchpad')).toBe(
      AuthorizationActions.EXECUTE,
    );
  });
});

describe('AuthorizationPermissionBuilder.operation', () => {
  test('code = <subject>.<method>, action derived from method', () => {
    const op = AuthorizationPermissionBuilder.operation({
      subject: 'SaleOrder',
      method: 'find',
      scope: SCOPE,
      name: 'List sale orders',
    });
    expect(op.code).toBe('SaleOrder.find');
    expect(op.subject).toBe('SaleOrder');
    expect(op.action).toBe(AuthorizationActions.READ);
    expect(op.scope).toBe(SCOPE);
    expect(op.parentId).toBeNull();
    expect(op.description).toBeNull();
  });

  test('explicit action overrides; description included only when provided', () => {
    const op = AuthorizationPermissionBuilder.operation({
      subject: 'SaleOrder',
      method: 'refund',
      scope: SCOPE,
      name: { en: 'Refund', vi: 'Hoàn tiền' },
      description: { en: 'Refund an order', vi: 'Hoàn tiền đơn' },
      action: AuthorizationActions.EXECUTE,
    });
    expect(op.action).toBe(AuthorizationActions.EXECUTE);
    expect(op.description).toEqual({ en: 'Refund an order', vi: 'Hoàn tiền đơn' });
  });
});

describe('AuthorizationPermissionBuilder.resourceNode', () => {
  test('coarse node: code/subject default, sentinel method, manage by default', () => {
    const node = AuthorizationPermissionBuilder.resourceNode({
      code: 'Sale',
      scope: SCOPE,
      name: 'Sale',
    });
    expect(node.code).toBe('Sale');
    expect(node.subject).toBe('Sale');
    expect(node.method).toBe('*');
    expect(node.action).toBe(AuthorizationActions.MANAGE);
    expect(node.code).not.toContain('.');
  });

  test('subject can differ from code, action overridable', () => {
    const node = AuthorizationPermissionBuilder.resourceNode({
      code: 'SaleOrder',
      subject: 'SaleOrder',
      scope: SCOPE,
      name: 'Sale order',
      action: AuthorizationActions.READ,
    });
    expect(node.action).toBe(AuthorizationActions.READ);
  });
});

describe('AuthorizationPermissionBuilder.crud', () => {
  test('generates the default CRUD set with correct actions and formatted names', () => {
    const rows = AuthorizationPermissionBuilder.crud({
      subject: 'SaleOrder',
      scope: SCOPE,
      name: ({ subject, method }) => `${subject}.${method}`,
    });
    expect(rows).toHaveLength(AuthorizationPermissionBuilder.DEFAULT_CRUD_METHODS.length);

    const find = rows.find(r => r.method === 'find');
    expect(find?.code).toBe('SaleOrder.find');
    expect(find?.action).toBe(AuthorizationActions.READ);
    expect(find?.name).toBe('SaleOrder.find');
    expect(find?.description).toBeNull();

    const del = rows.find(r => r.method === 'deleteById');
    expect(del?.action).toBe(AuthorizationActions.DELETE);
  });

  test('description formatter is applied when provided', () => {
    const rows = AuthorizationPermissionBuilder.crud({
      subject: 'SaleOrder',
      scope: SCOPE,
      name: ({ method }) => method,
      description: ({ subject, method }) => `${method} ${subject}`,
      methods: ['find', 'create'],
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.description).toBe(`${row.method} SaleOrder`);
    }
  });
});
