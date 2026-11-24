import { ScopeOperations } from '@venizia/ignis-kernel';
import type { TScopeOperation } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import { ScopeWriteGuard } from '@/relational/core/repositories/common/scope-write-guard';

/**
 * The write side of a scope on ONE member of a JSON column (`{ 'metadata.merchantId': 'm-a' }`), deny first: every payload
 * that is not provably inside the scope is refused, and what is allowed is stated after.
 */

const SCOPE = { 'metadata.merchantId': 'm-a' };

const apply = (opts: {
  rows: Array<Record<string, unknown>>;
  operation?: TScopeOperation;
  scope?: Record<string, unknown>;
  mode?: 'assign' | 'reject';
  sharedRows?: boolean;
  columns?: Array<string>;
}) =>
  ScopeWriteGuard.apply({
    settings: {
      resolve: () => opts.scope ?? SCOPE,
      write: { mode: opts.mode ?? 'reject', sharedRows: opts.sharedRows ?? false },
      columns: opts.columns,
    },
    model: 'items',
    rows: opts.rows,
    operation: opts.operation ?? ScopeOperations.CREATE,
  });

const refused = (opts: Parameters<typeof apply>[0], pattern: RegExp) => {
  expect(() => apply(opts)).toThrow(pattern);
};

describe('a create is held to the member', () => {
  test('a foreign value is refused', () => {
    refused({ rows: [{ metadata: { merchantId: 'm-b' } }] }, /outside the resolved scope/);
  });

  test.each([
    ['a string', 'm-a'],
    ['an array', ['m-a']],
    ['a number', 7],
    ['a boolean', true],
    ['a Date', new Date(0)],
    ['a class instance', new (class Raw {})()],
    ['a raw sql-like object', Object.create({ merchantId: 'm-a' })],
  ])('a column that is %s, not a JSON object, is refused', (_label, metadata) => {
    refused({ rows: [{ metadata }] }, /the JSON column is not an object/);
  });

  test('a column without the key is refused, and so is a key that is null, without sharedRows', () => {
    refused({ rows: [{ metadata: { other: 1 } }] }, /the scope key is missing/);
    refused({ rows: [{ metadata: { merchantId: null } }] }, /outside the resolved scope/);
  });

  test('an absent column and a null column are refused without sharedRows', () => {
    refused({ rows: [{ name: 'x' }] }, /the scope key is missing/);
    refused({ rows: [{ metadata: null }] }, /the scope key is missing/);
  });

  test('a non-scalar value for the key is refused', () => {
    refused({ rows: [{ metadata: { merchantId: { id: 'm-a' } } }] }, /outside the resolved scope/);
    refused({ rows: [{ metadata: { merchantId: ['m-a'] } }] }, /outside the resolved scope/);
  });

  test('the value is read from an own key only: an inherited merchantId is not the row value', () => {
    const inherited = Object.create({ merchantId: 'm-a' });

    refused({ rows: [{ metadata: inherited }] }, /not an object|missing/);
  });

  test('every row of a batch is held, and one bad row refuses the batch', () => {
    refused(
      { rows: [{ metadata: { merchantId: 'm-a' } }, { metadata: { merchantId: 'm-b' } }] },
      /outside the resolved scope/,
    );
  });

  test('a value inside the scope is allowed, text and number alike', () => {
    expect(() => apply({ rows: [{ metadata: { merchantId: 'm-a', other: 1 } }] })).not.toThrow();
    expect(() =>
      apply({ scope: { 'metadata.tenant': 7 }, rows: [{ metadata: { tenant: 7 } }] }),
    ).not.toThrow();
    expect(() =>
      apply({ scope: { 'metadata.tenant': 7 }, rows: [{ metadata: { tenant: '7' } }] }),
    ).not.toThrow();
    refused({ scope: { 'metadata.tenant': 7 }, rows: [{ metadata: { tenant: 8 } }] }, /outside/);
  });
});

describe('an update is a partial payload: every key that reaches the column is judged', () => {
  const update = (row: Record<string, unknown>) =>
    apply({ rows: [row], operation: ScopeOperations.UPDATE });

  test('a path to the scope key with a foreign value is refused, in either spelling', () => {
    expect(() => update({ 'metadata.merchantId': 'm-b' })).toThrow(/outside the resolved scope/);
    expect(() => update({ 'metadata[merchantId]': 'm-b' })).toThrow(/outside the resolved scope/);
    expect(() => update({ '[metadata].merchantId': 'm-b' })).toThrow(/outside the resolved scope/);
  });

  test('both spellings in one payload are both judged', () => {
    expect(() => update({ 'metadata.merchantId': 'm-a', 'metadata[merchantId]': 'm-b' })).toThrow(
      /outside the resolved scope/,
    );
  });

  test('a path to the scope key set to null is a move into the shared set: refused without sharedRows', () => {
    expect(() => update({ 'metadata.merchantId': null })).toThrow(/outside the resolved scope/);
    expect(() =>
      apply({
        rows: [{ 'metadata.merchantId': null }],
        operation: ScopeOperations.UPDATE,
        sharedRows: true,
      }),
    ).not.toThrow();
  });

  test('a path under the scope key is refused: its value cannot be judged', () => {
    expect(() => update({ 'metadata.merchantId.id': 'm-a' })).toThrow(/under the scope member/);
    expect(() => update({ 'metadata.merchantId[0]': 'm-a' })).toThrow(/under the scope member/);
  });

  test('the whole column replaced must hold the key with an allowed value', () => {
    expect(() => update({ metadata: { other: 1 } })).toThrow(/the scope key is missing/);
    expect(() => update({ metadata: { merchantId: 'm-b' } })).toThrow(/outside the resolved scope/);
    expect(() => update({ metadata: 'not json' })).toThrow(/the JSON column is not an object/);
    expect(() => update({ metadata: ['m-a'] })).toThrow(/the JSON column is not an object/);
    expect(() => update({ metadata: { merchantId: 'm-a', other: 2 } })).not.toThrow();
  });

  test('the column set to null drops the key: refused without sharedRows', () => {
    expect(() => update({ metadata: null })).toThrow(/the scope key is missing/);
  });

  test('the whole column and a path of it in one payload is refused: the path would win and the whole be dropped', () => {
    expect(() => update({ metadata: { merchantId: 'm-a' }, 'metadata.other': 1 })).toThrow(
      /whole JSON column and a path of it/,
    );
    expect(() => update({ metadata: { merchantId: 'm-a' }, 'metadata[other]': 1 })).toThrow(
      /whole JSON column and a path of it/,
    );
  });

  test('other paths of the column, and other columns, are not the guard business', () => {
    expect(() => update({ 'metadata.other': 1 })).not.toThrow();
    expect(() => update({ 'metadata.other.deep': 1 })).not.toThrow();
    expect(() => update({ 'metadata[tags][0]': 'x' })).not.toThrow();
    expect(() => update({ name: 'renamed' })).not.toThrow();
    expect(() => update({ 'other.merchantId': 'm-b' })).not.toThrow();
  });

  test('an undefined value is not set: it is not judged', () => {
    expect(() => update({ 'metadata.merchantId': undefined, name: 'x' })).not.toThrow();
  });

  test('a path to the scope key with a value inside the scope is allowed', () => {
    expect(() => update({ 'metadata.merchantId': 'm-a' })).not.toThrow();
    expect(() => update({ 'metadata[merchantId]': 'm-a', 'metadata.other': 1 })).not.toThrow();
  });
});

describe('an in scope on a member, and the shared set', () => {
  const scope = { 'metadata.merchantId': { in: ['m-a', 'm-c'] } };

  test('any value of the list is allowed, any other is refused', () => {
    expect(() => apply({ scope, rows: [{ metadata: { merchantId: 'm-c' } }] })).not.toThrow();
    refused({ scope, rows: [{ metadata: { merchantId: 'm-b' } }] }, /outside the resolved scope/);
  });

  test('an or of the list and null reads the shared rows, and writes them only with sharedRows', () => {
    const shared = {
      or: [{ 'metadata.merchantId': { in: ['m-a'] } }, { 'metadata.merchantId': null }],
    };

    refused(
      { scope: shared, rows: [{ metadata: { merchantId: null } }] },
      /outside the resolved scope/,
    );
    refused({ scope: shared, rows: [{ name: 'no owner' }] }, /the scope key is missing/);
    expect(() =>
      apply({ scope: shared, rows: [{ metadata: { merchantId: null } }], sharedRows: true }),
    ).not.toThrow();
    expect(() =>
      apply({ scope: shared, rows: [{ metadata: { merchantId: 'm-a' } }] }),
    ).not.toThrow();
  });

  test('an or over two different members is refused', () => {
    refused(
      {
        scope: { or: [{ 'metadata.merchantId': 'm-a' }, { 'metadata.ownerId': 'm-a' }] },
        rows: [{ metadata: { merchantId: 'm-a' } }],
      },
      /different columns/,
    );
  });

  test('the dot and bracket spellings of one member are one constraint in an or', () => {
    expect(() =>
      apply({
        scope: { or: [{ 'metadata.merchantId': 'm-a' }, { 'metadata[merchantId]': 'm-c' }] },
        rows: [{ metadata: { merchantId: 'm-c' } }],
      }),
    ).not.toThrow();
  });
});

describe('assign stamps into a copy, only when the key is absent', () => {
  const assign = (rows: Array<Record<string, unknown>>, scope: Record<string, unknown> = SCOPE) =>
    apply({ rows, mode: 'assign', scope });

  test('an absent column gets a new object holding the key', () => {
    const [stamped] = assign([{ name: 'x' }]);

    expect(stamped).toEqual({ name: 'x', metadata: { merchantId: 'm-a' } });
  });

  test('a column without the key keeps its members, in a copy: the caller object is not changed', () => {
    const metadata = { other: 1 };
    const row = { name: 'x', metadata };
    const [stamped] = assign([row]);

    expect(stamped).toEqual({ name: 'x', metadata: { other: 1, merchantId: 'm-a' } });
    expect(stamped).not.toBe(row);
    expect(stamped?.metadata).not.toBe(metadata);
    expect(metadata).toEqual({ other: 1 });
    expect(row).toEqual({ name: 'x', metadata: { other: 1 } });
  });

  test('a null column becomes an object holding the key', () => {
    const [stamped] = assign([{ metadata: null }]);

    expect(stamped).toEqual({ metadata: { merchantId: 'm-a' } });
  });

  test('a present key is judged, never overwritten: a foreign value is still refused', () => {
    expect(() => assign([{ metadata: { merchantId: 'm-b' } }])).toThrow(
      /outside the resolved scope/,
    );
    expect(() => assign([{ metadata: { merchantId: null } }])).toThrow(
      /outside the resolved scope/,
    );
  });

  test('the value is stamped as the scope wrote it: a number stays a number', () => {
    const [stamped] = assign([{}], { 'metadata.tenant': 7 });

    expect(stamped).toEqual({ metadata: { tenant: 7 } });
  });

  test('a column that is not an object is refused, not replaced', () => {
    expect(() => assign([{ metadata: 'text' }])).toThrow(/the JSON column is not an object/);
  });

  test('an update stamps nothing', () => {
    expect(() =>
      apply({
        rows: [{ metadata: { other: 1 } }],
        mode: 'assign',
        operation: ScopeOperations.UPDATE,
      }),
    ).toThrow(/the scope key is missing/);
  });
});

describe('the keys the guard can hold a payload to', () => {
  test.each([
    ['two members', { 'metadata.a.b': 'x' }],
    ['a numeric member', { 'metadata[0]': 'x' }],
    ['the prototype', { 'metadata.__proto__': 'x' }],
    ['the constructor', { 'metadata.constructor': 'x' }],
    ['a member with a space', { 'metadata[a b]': 'x' }],
  ])('%s is refused as unverifiable', (_label, scope) => {
    expect(() => apply({ scope, rows: [{ metadata: {} }] })).toThrow(/cannot be verified/);
  });

  test('a range or a like on a member is refused', () => {
    expect(() =>
      apply({ scope: { 'metadata.merchantId': { gt: 'm' } }, rows: [{ metadata: {} }] }),
    ).toThrow(/operator 'gt'/);
  });

  test('access.columns takes the root column of a member', () => {
    expect(() =>
      apply({ rows: [{ metadata: { merchantId: 'm-a' } }], columns: ['metadata'] }),
    ).not.toThrow();
    expect(() =>
      apply({ rows: [{ metadata: { merchantId: 'm-a' } }], columns: ['merchantId'] }),
    ).toThrow(/column 'metadata'.*does not declare/);
  });
});

describe('a payload key that would reach the prototype is not read as the member', () => {
  test('__proto__ as an own key of the payload object does not satisfy the scope', () => {
    const payload = JSON.parse('{"metadata":{"__proto__":{"merchantId":"m-a"}}}');

    refused({ rows: [payload] }, /the scope key is missing/);
  });
});
