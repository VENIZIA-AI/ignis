import { describe, expect, test } from 'bun:test';
import type {
  IAuthorizationDomainSource,
  TAuthorizationDomainResolver,
  IAuthorizationSpec,
} from '@venizia/ignis-kernel';
import { Authorization, AuthorizationDomainScopes } from '@venizia/ignis-kernel';
import { resolveRequestDomain } from '@venizia/ignis-kernel';

// Minimal Hono-context stub exposing the accessors the helper uses.
function ctxStub(opts: {
  params?: Record<string, string>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  context?: Record<string, string>;
}) {
  return {
    req: {
      param: (k: string) => opts.params?.[k],
      header: (k: string) => opts.headers?.[k],
      query: (k: string) => opts.query?.[k],
    },
    get: (k: string) => opts.context?.[k],
    // Stub only implements the accessors resolveRequestDomain reads, not the full Hono Context shape.
  } as Parameters<typeof resolveRequestDomain>[0]['context'];
}

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

describe('resolveRequestDomain', () => {
  test('declarative from param → "<type>_<id>"', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'param', key: 'merchantId', type: 'Merchant' },
      },
      context: ctxStub({ params: { merchantId: '7' } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_7');
  });

  test('declarative from context → "<type>_<id>"', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'context', key: 'currentMerchant', type: 'Merchant' },
      },
      context: ctxStub({ context: { currentMerchant: '7' } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_7');
  });

  test('declarative from context with missing value → SYSTEM_WIDE', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'context', key: 'currentMerchant', type: 'Merchant' },
      },
      context: ctxStub({}),
      options: undefined,
    });
    expect(dom).toBe(AuthorizationDomainScopes.SYSTEM_WIDE);
  });

  test('method resolver wins over global', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: () => ({ type: 'Organizer', id: '3' }),
      },
      context: ctxStub({}),
      options: { defaultDecision: 'deny', domainResolver: () => ({ type: 'Merchant', id: '1' }) },
    });
    expect(dom).toBe('Organizer_3');
  });

  test('falls back to global resolver when spec.domain absent', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order' },
      context: ctxStub({}),
      options: { defaultDecision: 'deny', domainResolver: () => ({ type: 'Merchant', id: '9' }) },
    });
    expect(dom).toBe('Merchant_9');
  });

  test('SYSTEM_WIDE when nothing resolves', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order' },
      context: ctxStub({}),
      options: { defaultDecision: 'deny' },
    });
    expect(dom).toBe(AuthorizationDomainScopes.SYSTEM_WIDE);
  });

  test('declarative with missing value → SYSTEM_WIDE', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'header', key: 'x-merchant-id', type: 'Merchant' },
      },
      context: ctxStub({}),
      options: undefined,
    });
    expect(dom).toBe(AuthorizationDomainScopes.SYSTEM_WIDE);
  });
});
