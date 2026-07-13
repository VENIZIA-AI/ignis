import { describe, expect, test } from 'bun:test';
import { buildPostgresJsOptions, PoolerModes } from '@/connectors/postgres/supabase';

describe('buildPostgresJsOptions', () => {
  test('transaction mode disables prepared statements', () => {
    // Supavisor rebinds the backend per transaction, so a server-side prepared statement is not
    // there next time. This is the single most common Supabase + postgres-js failure.
    expect(buildPostgresJsOptions({ mode: PoolerModes.TRANSACTION }).prepare).toBe(false);
  });

  test('session mode keeps prepared statements', () => {
    expect(buildPostgresJsOptions({ mode: PoolerModes.SESSION }).prepare).toBe(true);
  });

  test('direct mode keeps prepared statements', () => {
    expect(buildPostgresJsOptions({ mode: PoolerModes.DIRECT }).prepare).toBe(true);
  });

  test('max is forwarded when supplied', () => {
    expect(buildPostgresJsOptions({ mode: PoolerModes.DIRECT, max: 5 }).max).toBe(5);
  });

  test('max is absent when not supplied, rather than defaulted', () => {
    // postgres-js has its own default; inventing one here would silently override it.
    expect(buildPostgresJsOptions({ mode: PoolerModes.DIRECT }).max).toBeUndefined();
  });

  test('an unknown mode throws, naming the accepted modes', () => {
    expect(() => buildPostgresJsOptions({ mode: 'nope' as never })).toThrow(/pooler mode/i);
  });
});
