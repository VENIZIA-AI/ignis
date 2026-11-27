import { ScopeOperations } from '@venizia/ignis-kernel';
import type { TScopeOperation } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import { ScopeResolution } from '@/relational/core/repositories/common/scope-filter';
import { ScopeWriteGuard } from '@/relational/core/repositories/common/scope-write-guard';

/** The write side of `access`, read from the resolved scope: what is refused, and what is stamped. */

const apply = (opts: {
  scope: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  operation?: TScopeOperation;
  mode?: 'assign' | 'reject';
}) =>
  ScopeWriteGuard.apply({
    settings: { resolve: () => opts.scope, write: { mode: opts.mode ?? 'reject' } },
    model: 'items',
    rows: opts.rows,
    operation: opts.operation ?? ScopeOperations.CREATE,
  });

describe('a scope key that is not one member of a JSON column is refused, in either spelling', () => {
  test.each([
    ['dot, two members', { 'metadata.merchant.id': 'm-a' }],
    ['bracket, two members', { 'metadata[merchant][id]': 'm-a' }],
    ['a numeric part', { 'metadata[0]': 'm-a' }],
    ['a prototype key', { 'metadata.__proto__': 'm-a' }],
    ['a constructor key', { 'metadata[constructor]': 'm-a' }],
  ])('%s: the write is refused as unverifiable, on a create and on an update', (_label, scope) => {
    const operations: Array<TScopeOperation> = [ScopeOperations.CREATE, ScopeOperations.UPDATE];

    for (const operation of operations) {
      expect(() =>
        apply({ scope, rows: [{ metadata: { merchantId: 'm-b' } }], operation }),
      ).toThrow(/cannot be verified.*(depth 1|plain member)/s);
    }
  });

  test('inside an and, and inside an or branch, too', () => {
    expect(() =>
      apply({ scope: { and: [{ merchantId: 'm-a' }, { 'meta[a][b]': 'm-a' }] }, rows: [{}] }),
    ).toThrow(/depth 1/);
    expect(() =>
      apply({ scope: { or: [{ 'meta[a][b]': 'm-a' }, { 'meta[a][b]': 'm-b' }] }, rows: [{}] }),
    ).toThrow(/cannot be checked on a write/);
  });

  test('the narrowing for an update or a delete refuses it as well', () => {
    const scopeWhere = { 'metadata[a][b]': 'm-a' };
    const operations: Array<TScopeOperation> = [ScopeOperations.UPDATE, ScopeOperations.DELETE];

    for (const operation of operations) {
      expect(() =>
        ScopeWriteGuard.mutationWhere({
          settings: { resolve: () => scopeWhere },
          model: 'items',
          operation,
          scopeWhere,
        }),
      ).toThrow(/depth 1/);
    }
  });
});

describe('assign stamps the value as the scope wrote it', () => {
  test('a number stays a number, a boolean a boolean', () => {
    const [numeric] = apply({ scope: { tenantId: 7 }, rows: [{ name: 'a' }], mode: 'assign' });
    const [flag] = apply({ scope: { active: true }, rows: [{ name: 'a' }], mode: 'assign' });

    expect(numeric).toEqual({ name: 'a', tenantId: 7 });
    expect(flag).toEqual({ name: 'a', active: true });
  });

  test('the caller row is not changed, and a value outside the scope is still refused', () => {
    const row = { name: 'a' };
    const [stamped] = apply({ scope: { tenantId: 7 }, rows: [row], mode: 'assign' });

    expect(stamped).not.toBe(row);
    expect(row).toEqual({ name: 'a' });
    expect(() =>
      apply({ scope: { tenantId: 7 }, rows: [{ tenantId: 8 }], mode: 'assign' }),
    ).toThrow(/outside the resolved scope/);
  });

  test('a number in the row matches the scope number, as text', () => {
    expect(() => apply({ scope: { tenantId: 7 }, rows: [{ tenantId: '7' }] })).not.toThrow();
  });
});

describe('ScopeResolution reads one level into an operator object', () => {
  test.each([
    ['in', { merchantId: { in: undefined } }],
    ['inq', { merchantId: { inq: undefined } }],
    ['eq', { merchantId: { eq: undefined } }],
    ['in an and', { and: [{ merchantId: { in: undefined } }] }],
  ])('an undefined operand (%s) is not a usable scope', (_label, value) => {
    expect(ScopeResolution.normalize({ value })).toBeNull();
  });

  test('a defined operand, a null operand, a date and a plain value are usable', () => {
    for (const value of [
      { merchantId: { in: ['m-a'] } },
      { merchantId: { eq: null } },
      { createdAt: { gt: new Date(0) } },
      { merchantId: 'm-a' },
    ]) {
      expect(ScopeResolution.normalize({ value })).toBe(value);
    }
  });
});

describe('an and member that is no object', () => {
  test('makes the scope unverifiable instead of reading as no constraint', () => {
    for (const member of [7, 'x', true, null]) {
      // As an untyped caller would hand it: the type refuses such a member.
      const where = JSON.parse(JSON.stringify({ and: [{ tenantId: 7 }, member] }));

      expect(ScopeWriteGuard.extractConstraints({ where })).toEqual({
        isVerifiable: false,
        reason: "an 'and' member is not an object",
      });
    }
  });
});
