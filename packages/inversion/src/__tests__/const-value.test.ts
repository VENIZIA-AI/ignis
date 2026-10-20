import { describe, expect, test } from 'bun:test';
import type { TConstValue } from '@/common/types';

class Scopes {
  static readonly SINGLETON = 'singleton';
  static readonly TRANSIENT = 'transient';
  static readonly DEPTH = 1;
}

/** Enforced by tsc, not by the runner: this compiles only while `TConstValue` stays a literal union. */
describe('TConstValue - literal union', () => {
  test('a value mapped into a new object literal or a let keeps the literal union', () => {
    const rows: { scope: TConstValue<typeof Scopes> }[] = [
      { scope: Scopes.SINGLETON },
      { scope: Scopes.DEPTH },
    ];

    const mapped = rows.map(row => ({ scope: row.scope }));
    const typed: { scope: 'singleton' | 'transient' | 1 }[] = mapped;
    let current = typed[0].scope;
    const initial = current;
    current = Scopes.TRANSIENT;

    expect([...typed.map(row => row.scope), initial, current]).toEqual([
      'singleton',
      1,
      'singleton',
      'transient',
    ]);
  });
});
