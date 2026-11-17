/* eslint-disable @typescript-eslint/naming-convention -- postgres-js spells its error fields in snake_case (`table_name`), and the fixtures copy the driver exactly */
import { describe, expect, test } from 'bun:test';
import { PostgresErrors } from '@/base/middlewares/app-error/postgres-errors';
import * as kernel from '@/index';

/** The error a node-postgres `DatabaseError` is: every protocol field is set, the unused ones as `undefined` (pg-protocol parser.js `parseErrorMessage`). */
const nodePostgresError = () => {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "users_email_key"'),
    {
      name: 'error',
      length: 205,
      severity: 'ERROR',
      code: '23505',
      detail: 'Key (email)=(a@b.com) already exists.',
      hint: undefined,
      position: undefined,
      internalPosition: undefined,
      internalQuery: undefined,
      where: undefined,
      schema: 'public',
      table: 'users',
      column: undefined,
      dataType: undefined,
      constraint: 'users_email_key',
      file: 'nbtinsert.c',
      line: '666',
      routine: '_bt_check_unique',
    },
  );
};

/** The error postgres-js throws: a `PostgresError` that `Object.assign`s the protocol fields under their snake_case names (postgres/src/connection.js `errorFields`). */
const postgresJsError = () => {
  return Object.assign(new Error('null value in column "name" violates not-null constraint'), {
    name: 'PostgresError',
    severity_local: 'ERROR',
    severity: 'ERROR',
    code: '23502',
    detail: 'Failing row contains (1, null).',
    schema_name: 'public',
    table_name: 'users',
    column_name: 'name',
    constraint_name: undefined,
    file: 'execMain.c',
    line: '1',
    routine: 'ExecConstraints',
  });
};

/** The error PGlite throws: the same `DatabaseError` shape as node-postgres (its `.d.ts` declares `code`, `detail`, `schema`, `table`, `column`, `constraint`). */
const pgliteError = () => {
  return Object.assign(new Error('insert or update on table "orders" violates foreign key'), {
    name: 'error',
    length: 0,
    severity: 'ERROR',
    code: '23503',
    detail: 'Key (user_id)=(9) is not present in table "users".',
    schema: 'public',
    table: 'orders',
    constraint: 'orders_user_id_fkey',
  });
};

/** Wraps `inner` in `levels` plain errors, the way an ORM wraps a driver error in `cause`. */
const wrap = (opts: { inner: unknown; levels: number }) => {
  let current: unknown = opts.inner;

  for (let i = 0; i < opts.levels; i += 1) {
    current = new Error(`wrapper ${i + 1}`, { cause: current });
  }

  return current;
};

describe('PostgresErrors.find - a direct hit', () => {
  test('returns the code, constraint, detail, table, schema and message of the error itself', () => {
    const found = PostgresErrors.find({ error: nodePostgresError() });

    expect(found).toEqual({
      code: '23505',
      constraint: 'users_email_key',
      detail: 'Key (email)=(a@b.com) already exists.',
      table: 'users',
      schema: 'public',
      message: 'duplicate key value violates unique constraint "users_email_key"',
    });
  });

  test('omits the fields the driver left unset', () => {
    const found = PostgresErrors.find({ error: Object.assign(new Error('x'), { code: '40001' }) });

    expect(found).toEqual({ code: '40001', message: 'x' });
    expect(Object.keys(found ?? {}).sort()).toEqual(['code', 'message']);
  });

  test('a plain object with a code is a Postgres error too', () => {
    expect(PostgresErrors.find({ error: { code: '23503' } })).toEqual({ code: '23503' });
  });
});

describe('PostgresErrors.find - inside a wrapped error', () => {
  test.each([1, 2, 3])('finds the error %d level(s) deep in cause', (levels) => {
    const found = PostgresErrors.find({ error: wrap({ inner: nodePostgresError(), levels }) });

    expect(found?.code).toBe('23505');
    expect(found?.constraint).toBe('users_email_key');
    expect(found?.table).toBe('users');
  });

  test('finds the error at the deepest level the bound allows (10)', () => {
    const found = PostgresErrors.find({ error: wrap({ inner: nodePostgresError(), levels: 10 }) });

    expect(found?.code).toBe('23505');
  });

  test('does not find the error at depth 11 (the documented bound)', () => {
    expect(PostgresErrors.MAX_DEPTH).toBe(10);
    expect(
      PostgresErrors.find({ error: wrap({ inner: nodePostgresError(), levels: 11 }) }),
    ).toBeUndefined();
  });

  test('the first match wins: the outermost Postgres error', () => {
    const inner = Object.assign(new Error('inner'), { code: '23503', constraint: 'inner_fkey' });
    const outer = Object.assign(new Error('outer', { cause: inner }), {
      code: '23505',
      constraint: 'outer_key',
    });

    expect(PostgresErrors.find({ error: wrap({ inner: outer, levels: 2 }) })?.constraint).toBe(
      'outer_key',
    );
  });

  test('skips an outer error whose code is not a SQLSTATE and keeps walking', () => {
    const inner = Object.assign(new Error('inner'), { code: '23505' });
    const outer = Object.assign(new Error('socket', { cause: inner }), { code: 'ECONNRESET' });

    expect(PostgresErrors.find({ error: outer })?.code).toBe('23505');
  });

  test('returns undefined for a chain with no Postgres error', () => {
    expect(PostgresErrors.find({ error: wrap({ inner: new Error('plain'), levels: 3 }) })).toBe(
      undefined,
    );
  });
});

describe('PostgresErrors.find - a value is a Postgres error only with a SQLSTATE code', () => {
  test.each([
    ['ECONNRESET', 'ECONNRESET'],
    ['a number', 23505],
    ['too short', '2350'],
    ['too long', '235050'],
    ['lower case', '23p01'],
    ['empty', ''],
    ['padded', ' 23505'],
    ['null', null],
    ['an object', { toString: () => '23505' }],
  ])('code %s is not a Postgres error', (_label, code) => {
    expect(PostgresErrors.find({ error: Object.assign(new Error('x'), { code }) })).toBe(undefined);
  });

  test.each(['23505', '40P01', '22P02', '0A000', '57014'])('code %s is one', (code) => {
    expect(PostgresErrors.find({ error: { code } })?.code).toBe(code);
  });

  test('a driver field of the wrong type is dropped, the error still counts', () => {
    const found = PostgresErrors.find({
      error: { code: '23505', constraint: 42, detail: { a: 1 }, table: 'users' },
    });

    expect(found).toEqual({ code: '23505', table: 'users' });
  });
});

describe('PostgresErrors.find - cycles', () => {
  test('a.cause = b, b.cause = a terminates with undefined', () => {
    const a: { cause?: unknown } = {};
    const b: { cause?: unknown } = { cause: a };
    a.cause = b;

    expect(PostgresErrors.find({ error: a })).toBe(undefined);
  });

  test('the visited set stops the walk at the first repeat, not at the depth bound', () => {
    // The depth bound alone would also end a cycle, after 11 hops; counting the reads of `cause` shows which of the two did.
    let reads = 0;
    const b: { cause?: unknown } = {};
    const a = {
      get cause(): unknown {
        reads += 1;

        return b;
      },
    };
    b.cause = a;

    expect(PostgresErrors.find({ error: a })).toBe(undefined);
    expect(reads).toBe(1);
  });

  test('an error that is its own cause terminates', () => {
    const a: { cause?: unknown } = {};
    a.cause = a;

    expect(PostgresErrors.find({ error: a })).toBe(undefined);
  });

  test('a cycle still lets an earlier match through', () => {
    const a: { code: string; cause?: unknown } = { code: '23505' };
    a.cause = a;

    expect(PostgresErrors.find({ error: a })?.code).toBe('23505');
  });
});

describe('PostgresErrors.find - hostile and non-error input', () => {
  test.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', '23505'],
    ['a number', 23505],
    ['a boolean', true],
    ['a bigint', BigInt(5)],
    ['a symbol', Symbol('x')],
    ['a function', () => '23505'],
  ])('%s is not a Postgres error', (_label, error) => {
    expect(PostgresErrors.find({ error })).toBe(undefined);
  });

  test('a throwing code getter does not throw', () => {
    const error = {
      get code(): string {
        throw new Error('boom');
      },
    };

    expect(PostgresErrors.find({ error })).toBe(undefined);
  });

  test('a throwing cause getter does not throw, and the error itself is still found', () => {
    const error = {
      code: '23505',
      get cause(): unknown {
        throw new Error('boom');
      },
    };

    expect(PostgresErrors.find({ error })?.code).toBe('23505');
  });

  test('a throwing getter on a wrapper hides only that branch', () => {
    const hostile = {
      get code(): string {
        throw new Error('boom');
      },
      cause: { code: '23503' },
    };

    expect(PostgresErrors.find({ error: hostile })?.code).toBe('23503');
  });

  test('a throwing detail getter drops that field only', () => {
    const error = {
      code: '23505',
      table: 'users',
      get detail(): string {
        throw new Error('boom');
      },
    };

    expect(PostgresErrors.find({ error })).toEqual({ code: '23505', table: 'users' });
  });

  test('a Proxy whose every trap throws does not throw', () => {
    const trap = () => {
      throw new Error('trap');
    };

    const error = new Proxy(
      {},
      { get: trap, has: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap },
    );

    expect(PostgresErrors.find({ error })).toBe(undefined);
  });

  test('a revoked Proxy does not throw', () => {
    const { proxy, revoke } = Proxy.revocable({ code: '23505' }, {});
    revoke();

    expect(PostgresErrors.find({ error: proxy })).toBe(undefined);
  });

  test('a Proxy in the middle of the chain does not hide a Postgres error above it', () => {
    const trap = () => {
      throw new Error('trap');
    };

    const proxy = new Proxy({}, { get: trap });
    const error = Object.assign(new Error('outer', { cause: proxy }), { code: '23505' });

    expect(PostgresErrors.find({ error })?.code).toBe('23505');
  });
});

describe('PostgresErrors.find - one result type for the three drivers', () => {
  test('node-postgres: constraint, table, schema as the driver spells them', () => {
    expect(PostgresErrors.find({ error: nodePostgresError() })).toMatchObject({
      code: '23505',
      constraint: 'users_email_key',
      table: 'users',
      schema: 'public',
    });
  });

  test('postgres-js: constraint_name, table_name, column_name, schema_name become the same fields', () => {
    expect(PostgresErrors.find({ error: postgresJsError() })).toEqual({
      code: '23502',
      detail: 'Failing row contains (1, null).',
      schema: 'public',
      table: 'users',
      column: 'name',
      message: 'null value in column "name" violates not-null constraint',
    });
  });

  test('postgres-js: constraint_name fills constraint when the server sent one', () => {
    const error = Object.assign(postgresJsError(), {
      code: '23505',
      constraint_name: 'users_name_key',
    });

    expect(PostgresErrors.find({ error })?.constraint).toBe('users_name_key');
  });

  test('PGlite: the node-postgres shape, found through a wrapper', () => {
    expect(PostgresErrors.find({ error: wrap({ inner: pgliteError(), levels: 2 }) })).toEqual({
      code: '23503',
      constraint: 'orders_user_id_fkey',
      detail: 'Key (user_id)=(9) is not present in table "users".',
      schema: 'public',
      table: 'orders',
      message: 'insert or update on table "orders" violates foreign key',
    });
  });

  test('when a driver gives both spellings, the node-postgres one wins', () => {
    const found = PostgresErrors.find({
      error: { code: '23505', constraint: 'a', constraint_name: 'b' },
    });

    expect(found?.constraint).toBe('a');
  });

  test('a Drizzle-style wrapper (query, params, cause) around a driver error', () => {
    const wrapper = Object.assign(new Error('Failed query: insert into "users" ...'), {
      name: 'DrizzleQueryError',
      query: 'insert into "users" ...',
      params: ['a@b.com'],
      cause: postgresJsError(),
    });

    expect(PostgresErrors.find({ error: wrapper })?.column).toBe('name');
  });
});

describe('PostgresErrors - the public surface', () => {
  test('the kernel entry exports the helper next to PostgresErrorCodes', () => {
    expect(kernel.PostgresErrors).toBe(PostgresErrors);
    expect(
      kernel.PostgresErrors.find({ error: { code: kernel.PostgresErrorCodes.UNIQUE_VIOLATION } }),
    ).toEqual({
      code: '23505',
    });
  });
});
