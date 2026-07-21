import { describe, expect, test } from 'bun:test';
import type {
  IAuthorizationSpec,
  TAuthorizationDomainResolver,
} from '@/components/auth/authorize/common/types';
import { AuthorizationDomainScopes } from '@/components/auth/authorize/common/constants';
import { resolveRequestDomain } from '@/components/auth/authorize/providers/request-domain';
import type { TNullable } from '@venizia/ignis-helpers';

/** resolveRequestDomain precedence: spec.domain method -> declarative -> options.domainResolver ->
 * SYSTEM_WIDE sentinel. A null/falsy or missing resolver returns SYSTEM_WIDE, NOT the next source -
 * fail-closed for ordinary users, since only super-admins hold SYSTEM_WIDE grants. */

// Hono-context stub exposing only the accessors the helper touches.
function ctxStub(opts: {
  params?: Record<string, string>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  context?: Record<string, unknown>;
}) {
  return {
    req: {
      param: (k: string) => opts.params?.[k],
      header: (k: string) => opts.headers?.[k],
      query: (k: string) => opts.query?.[k],
    },
    get: (k: string) => opts.context?.[k],
    // Cast is required: stub only implements the accessors resolveRequestDomain reads, not the full Hono Context shape.
  } as Parameters<typeof resolveRequestDomain>[0]['context'];
}

const SW = AuthorizationDomainScopes.SYSTEM_WIDE;

// Capture a thrown/rejected error from resolveRequestDomain so we can assert on it without
// relying on expect().rejects (which the lint rule flags as a non-thenable await).
async function captureError(run: () => Promise<unknown>): Promise<TNullable<Error>> {
  try {
    await run();
    return null;
  } catch (error) {
    return error as Error;
  }
}

describe('declarative sources — every `from`', () => {
  test('from=param present', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'param', key: 'mId', type: 'Merchant' },
      },
      context: ctxStub({ params: { mId: '7' } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_7');
  });

  test('from=header present', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'header', key: 'x-m', type: 'Merchant' },
      },
      context: ctxStub({ headers: { 'x-m': '7' } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_7');
  });

  test('from=query present', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'query', key: 'm', type: 'Merchant' },
      },
      context: ctxStub({ query: { m: '7' } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_7');
  });

  test('from=context present', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'context', key: 'cm', type: 'Merchant' },
      },
      context: ctxStub({ context: { cm: '7' } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_7');
  });

  test('each `from` ABSENT → SYSTEM_WIDE', async () => {
    for (const from of ['param', 'header', 'query', 'context'] as const) {
      const dom = await resolveRequestDomain({
        spec: { action: 'read', resource: 'Order', domain: { from, key: 'k', type: 'Merchant' } },
        context: ctxStub({}),
        options: undefined,
      });
      expect(dom).toBe(SW);
    }
  });
});

describe('declarative — value formatting & edge values', () => {
  test('numeric-looking id stays a string, no quoting ("Merchant_7" not "Merchant_\'7\'")', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'param', key: 'm', type: 'Merchant' },
      },
      context: ctxStub({ params: { m: '7' } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_7');
  });

  test('uuid id formats as Type_<uuid>', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'param', key: 'm', type: 'Merchant' },
      },
      context: ctxStub({ params: { m: 'a1b2-c3' } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_a1b2-c3');
  });

  test('context value coerced via String() — number from context becomes "7"', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'context', key: 'cm', type: 'Merchant' },
      },
      context: ctxStub({ context: { cm: 7 } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_7');
  });

  test('context value of 0 (number) → String(0)="0" is truthy as a string → "Merchant_0"', async () => {
    // readDeclarative returns String(0)='0'; resolveRequestDomain checks `id ? ...` where '0' is truthy.
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'context', key: 'cm', type: 'Merchant' },
      },
      context: ctxStub({ context: { cm: 0 } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_0');
  });

  test('EDGE: empty-string declarative value → falsy → SYSTEM_WIDE (not "Merchant_")', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'param', key: 'm', type: 'Merchant' },
      },
      context: ctxStub({ params: { m: '' } }),
      options: undefined,
    });
    expect(dom).toBe(SW);
  });

  test('EDGE: context value false → String(false)="false" (truthy string) → "Merchant_false"', async () => {
    // Documents a subtlety: a boolean false in context becomes the literal string "false".
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'context', key: 'cm', type: 'Merchant' },
      },
      context: ctxStub({ context: { cm: false } }),
      options: undefined,
    });
    expect(dom).toBe('Merchant_false');
  });

  test('EDGE: context value null → readDeclarative returns null → SYSTEM_WIDE', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'context', key: 'cm', type: 'Merchant' },
      },
      context: ctxStub({ context: { cm: null } }),
      options: undefined,
    });
    expect(dom).toBe(SW);
  });
});

describe('method resolver (spec.domain as function)', () => {
  test('returns {type,id} → "Type_id"', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order', domain: () => ({ type: 'Organizer', id: '3' }) },
      context: ctxStub({}),
      options: undefined,
    });
    expect(dom).toBe('Organizer_3');
  });

  test('numeric id → "Type_7" (no quoting)', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order', domain: () => ({ type: 'Merchant', id: 7 }) },
      context: ctxStub({}),
      options: undefined,
    });
    expect(dom).toBe('Merchant_7');
  });

  test('async method resolving a value', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: async () => ({ type: 'Merchant', id: '9' }),
      },
      context: ctxStub({}),
      options: undefined,
    });
    expect(dom).toBe('Merchant_9');
  });

  test('returns null → SYSTEM_WIDE', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order', domain: () => null },
      context: ctxStub({}),
      options: undefined,
    });
    expect(dom).toBe(SW);
  });

  test('SECURITY: async method that REJECTS propagates (fails closed — middleware must deny)', async () => {
    // resolveRequestDomain awaits spec.domain; a rejection is NOT swallowed. The caller's
    // authorize middleware therefore cannot silently treat a thrown resolver as SYSTEM_WIDE.
    const boom: TAuthorizationDomainResolver = async () => {
      throw new Error('resolver exploded');
    };
    const spec: IAuthorizationSpec = { action: 'read', resource: 'Order', domain: boom };
    const error = await captureError(() =>
      resolveRequestDomain({ spec, context: ctxStub({}), options: undefined }),
    );
    expect(error?.message).toBe('resolver exploded');
  });

  test('SECURITY: synchronous-throw method also propagates', async () => {
    const boom: TAuthorizationDomainResolver = () => {
      throw new Error('sync explode');
    };
    const spec: IAuthorizationSpec = { action: 'read', resource: 'Order', domain: boom };
    const error = await captureError(() =>
      resolveRequestDomain({ spec, context: ctxStub({}), options: undefined }),
    );
    expect(error?.message).toBe('sync explode');
  });
});

describe('precedence', () => {
  test('method beats declarative-shaped intent and global resolver', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order', domain: () => ({ type: 'Organizer', id: '3' }) },
      context: ctxStub({ params: { m: '7' } }),
      options: { defaultDecision: 'deny', domainResolver: () => ({ type: 'Merchant', id: '1' }) },
    });
    expect(dom).toBe('Organizer_3');
  });

  test('declarative beats global resolver', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'param', key: 'm', type: 'Merchant' },
      },
      context: ctxStub({ params: { m: '7' } }),
      options: { defaultDecision: 'deny', domainResolver: () => ({ type: 'Organizer', id: '1' }) },
    });
    expect(dom).toBe('Merchant_7');
  });

  test('declarative MISS does NOT fall through to global — returns SYSTEM_WIDE', async () => {
    // Important precedence subtlety: once spec.domain is declared, a missing value short-circuits
    // to SYSTEM_WIDE; the global resolver is NOT consulted as a fallback.
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'param', key: 'm', type: 'Merchant' },
      },
      context: ctxStub({}),
      options: { defaultDecision: 'deny', domainResolver: () => ({ type: 'Merchant', id: '1' }) },
    });
    expect(dom).toBe(SW);
  });

  test('method MISS (returns null) does NOT fall through to global — returns SYSTEM_WIDE', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order', domain: () => null },
      context: ctxStub({}),
      options: { defaultDecision: 'deny', domainResolver: () => ({ type: 'Merchant', id: '1' }) },
    });
    expect(dom).toBe(SW);
  });

  test('global resolver used only when spec.domain absent', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order' },
      context: ctxStub({}),
      options: { defaultDecision: 'deny', domainResolver: () => ({ type: 'Merchant', id: '9' }) },
    });
    expect(dom).toBe('Merchant_9');
  });

  test('global resolver returns null → SYSTEM_WIDE', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order' },
      context: ctxStub({}),
      options: { defaultDecision: 'deny', domainResolver: () => null },
    });
    expect(dom).toBe(SW);
  });

  test('async global resolver resolving a value', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order' },
      context: ctxStub({}),
      options: {
        defaultDecision: 'deny',
        domainResolver: async () => ({ type: 'Merchant', id: '5' }),
      },
    });
    expect(dom).toBe('Merchant_5');
  });

  test('SECURITY: global resolver rejection propagates (fails closed)', async () => {
    const error = await captureError(() =>
      resolveRequestDomain({
        spec: { action: 'read', resource: 'Order' },
        context: ctxStub({}),
        options: {
          defaultDecision: 'deny',
          domainResolver: async () => {
            throw new Error('global resolver boom');
          },
        },
      }),
    );
    expect(error?.message).toBe('global resolver boom');
  });

  test('no spec.domain and no global resolver and null options → SYSTEM_WIDE', async () => {
    const dom = await resolveRequestDomain({
      spec: { action: 'read', resource: 'Order' },
      context: ctxStub({}),
      options: null,
    });
    expect(dom).toBe(SW);
  });
});
