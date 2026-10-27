import { describe, expect, test } from 'bun:test';
import type {
  IAuthorizationDomainSource,
  TAuthorizationDomainResolver,
  IAuthorizationSpec,
} from '@venizia/ignis-kernel';
import { Authorization } from '@venizia/ignis-kernel';

describe('domain config types', () => {
  test('Authorization.DOMAIN context key exists', () => {
    expect(Authorization.DOMAIN).toBe('authorization.domain');
  });

  test('spec accepts declarative and method domain (compile-time)', () => {
    const declarative: IAuthorizationDomainSource = {
      from: 'param',
      key: 'merchantId',
      type: 'Merchant',
    };
    const method: TAuthorizationDomainResolver = () => ({ type: 'Merchant', id: '7' });
    const a: IAuthorizationSpec = { action: 'read', resource: 'Order', domain: declarative };
    const b: IAuthorizationSpec = { action: 'read', resource: 'Order', domain: method };
    expect(a.domain).toBeDefined();
    expect(b.domain).toBeDefined();
  });
});
