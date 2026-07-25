import { describe, expect, test } from 'bun:test';
import { AuthorizationPermissionBuilder } from '@/components/auth/authorize/builders/permission.builder';

/** `AuthorizationPermissionBuilder.objectMatch(requested, granted)` is true for a `*` grant (wildcard on the GRANT side only), an exact match, or requested being a dot-child of granted - direction matters, requested must fall UNDER granted. */
describe('objectMatch — wildcard grant', () => {
  test('`*` grant matches any requested resource', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('Order', '*')).toBe(true);
    expect(AuthorizationPermissionBuilder.objectMatch('Order.findById', '*')).toBe(true);
    expect(AuthorizationPermissionBuilder.objectMatch('', '*')).toBe(true); // even empty request
    expect(AuthorizationPermissionBuilder.objectMatch('*', '*')).toBe(true);
    expect(AuthorizationPermissionBuilder.objectMatch('a.b.c.d.e', '*')).toBe(true);
  });

  test('`*` is ONLY special on the GRANT side, never the request side', () => {
    // Adversarial: an attacker putting `*` in r.obj must NOT wildcard-match a specific grant.
    expect(AuthorizationPermissionBuilder.objectMatch('*', 'Order')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('*', 'Order.findById')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('*', '')).toBe(false);
  });
});

describe('objectMatch — exact match (equivalence class: identical strings)', () => {
  test('identical subject', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('Order', 'Order')).toBe(true);
  });

  test('identical endpoint', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('Order.findById', 'Order.findById')).toBe(
      true,
    );
  });

  test('identical deep path', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('a.b.c', 'a.b.c')).toBe(true);
  });

  test('empty equals empty', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('', '')).toBe(true);
  });
});

describe('objectMatch — dot-child / hierarchy (requested under granted)', () => {
  test('one-level child: endpoint under subject', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('Order.findById', 'Order')).toBe(true);
    expect(AuthorizationPermissionBuilder.objectMatch('Order.find', 'Order')).toBe(true);
    expect(AuthorizationPermissionBuilder.objectMatch('Order.create', 'Order')).toBe(true);
  });

  test('deeper child under top subject', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('A.b.c', 'A')).toBe(true);
    expect(AuthorizationPermissionBuilder.objectMatch('A.b.c.d', 'A')).toBe(true);
  });

  test('deeper child under intermediate node', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('A.b.c', 'A.b')).toBe(true);
    expect(AuthorizationPermissionBuilder.objectMatch('A.b.c.d', 'A.b.c')).toBe(true);
  });

  test('empty grant matches a dotted request beginning with "." ', () => {
    // startsWith('.') — `''` grant + `.x` request. This is an oddity worth locking.
    expect(AuthorizationPermissionBuilder.objectMatch('.x', '')).toBe(true);
    // but a non-dotted request does not (only exact-empty would).
    expect(AuthorizationPermissionBuilder.objectMatch('x', '')).toBe(false);
  });
});

describe('objectMatch — NON-match (DENY) equivalence classes', () => {
  test('different subject entirely', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('Order', 'Invoice')).toBe(false);
  });

  test('sibling subjects sharing a prefix but not a dot-boundary', () => {
    // The classic bypass risk: prefix-without-dot must NOT match.
    expect(AuthorizationPermissionBuilder.objectMatch('OrderItem', 'Order')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('Orders', 'Order')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('OrderItem.findById', 'Order')).toBe(false);
  });

  test('broader request, narrower grant → DENY (cannot widen scope)', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('Order', 'Order.findById')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('A', 'A.b')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('A.b', 'A.b.c')).toBe(false);
  });

  test('parent vs child of a different branch', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('A.b.c', 'A.x')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('A.b', 'A.c')).toBe(false);
  });

  test('empty request vs non-empty grant', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('', 'Order')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('', 'A.b')).toBe(false);
  });
});

describe('objectMatch — boundary / odd characters', () => {
  test('trailing dot on request is a child of the dot-less grant', () => {
    // 'Order.'.startsWith('Order.') === true
    expect(AuthorizationPermissionBuilder.objectMatch('Order.', 'Order')).toBe(true);
  });

  test('trailing dot on grant: request must start with "Order.." to be a child', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('Order.', 'Order.')).toBe(true); // exact
    expect(AuthorizationPermissionBuilder.objectMatch('Order.x', 'Order.')).toBe(false); // 'Order.x'.startsWith('Order..') === false
    expect(AuthorizationPermissionBuilder.objectMatch('Order..x', 'Order.')).toBe(true);
  });

  test('case sensitivity (no normalization)', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('order', 'Order')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('Order.FindById', 'Order.findById')).toBe(
      false,
    );
    expect(AuthorizationPermissionBuilder.objectMatch('ORDER', 'ORDER')).toBe(true);
  });

  test('unicode resources', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('订单', '订单')).toBe(true);
    expect(AuthorizationPermissionBuilder.objectMatch('订单.查询', '订单')).toBe(true);
    expect(AuthorizationPermissionBuilder.objectMatch('订单', '发票')).toBe(false);
  });

  test('a literal `*` embedded in a longer grant is NOT a wildcard', () => {
    // Only an EXACT '*' grant wildcards. 'A*' is a literal node.
    expect(AuthorizationPermissionBuilder.objectMatch('A', 'A*')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('A*', 'A*')).toBe(true); // exact literal
    expect(AuthorizationPermissionBuilder.objectMatch('A*.b', 'A*')).toBe(true); // dot-child of literal 'A*'
    expect(AuthorizationPermissionBuilder.objectMatch('AB', 'A*')).toBe(false);
  });

  test('a literal `*` embedded in the request is just a character', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('A.*', 'A')).toBe(true); // child of A
    expect(AuthorizationPermissionBuilder.objectMatch('*.x', 'Order')).toBe(false);
  });

  test('whitespace is significant (no trimming)', () => {
    expect(AuthorizationPermissionBuilder.objectMatch('Order ', 'Order')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch(' Order', 'Order')).toBe(false);
    expect(AuthorizationPermissionBuilder.objectMatch('Order', 'Order ')).toBe(false);
  });
});
