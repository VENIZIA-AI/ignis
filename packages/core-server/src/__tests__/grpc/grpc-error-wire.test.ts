import 'reflect-metadata';
import { describe, expect, spyOn, test } from 'bun:test';
import { Code, ConnectError } from '@connectrpc/connect';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { GRPC, HTTP } from '@venizia/ignis-helpers/common';
import { getError, LoggerFactory } from '@venizia/ignis-helpers/core';
import { Logger } from '@venizia/ignis-helpers/winston';
import { HTTPException } from 'hono/http-exception';
import { BaseGrpcController } from '@/base/controllers/grpc/base';

/** `greeter.v1.GreeterService` with one unary method, `SayHello`: the descriptor `protoc-gen-es` writes. */
const GreeterService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIh8KD1NheUhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJIiMKEFNheUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTJXCg5HcmVldGVyU2VydmljZRJFCghTYXlIZWxsbxIbLmdyZWV0ZXIudjEuU2F5SGVsbG9SZXF1ZXN0GhwuZ3JlZXRlci52MS5TYXlIZWxsb1Jlc3BvbnNlYgZwcm90bzM',
  ),
  0,
);

/** One real call through the adapter and the installed ConnectRPC: the HTTP status and the JSON body a client reads. */
const call = async (opts: { failure: unknown; env: string }) => {
  class GreeterController extends BaseGrpcController {
    override binding() {
      this.defineRoute({
        configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
        handler: () => {
          throw opts.failure;
        },
      });
    }
  }

  const controller = new GreeterController({ scope: 'GreeterController', path: '/grpc' });
  controller.service = GreeterService;
  await controller.configure();

  const response = await controller
    .getRouter()
    .request(
      '/greeter.v1.GreeterService/SayHello',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"a"}' },
      { NODE_ENV: opts.env },
    );

  const result = await response.json();

  return { status: response.status, body: result };
};

const INTERNAL = {
  status: HTTP.ResultCodes.RS_5.InternalServerError,
  body: { code: 'internal', message: 'internal error' },
};

describe.each(['production', 'development'])('gRPC errors on the wire - %s', (env) => {
  test('an IGNIS error answers its code and message', async () => {
    const failure = getError({ statusCode: 401, message: 'sign in first' });

    const result = await call({ failure, env });
    expect(result).toEqual({
      status: 401,
      body: { code: 'unauthenticated', message: 'sign in first' },
    });
  });

  test('a Hono HTTPException answers its code and message', async () => {
    const failure = new HTTPException(403, { message: 'not yours' });

    const result2 = await call({ failure, env });
    expect(result2).toEqual({
      status: 403,
      body: { code: 'permission_denied', message: 'not yours' },
    });
  });

  test('an error of another library that carries a statusCode stays internal', async () => {
    const failure = Object.assign(new Error('upstream said: token abc'), { statusCode: 401 });

    const result3 = await call({ failure, env });
    expect(result3).toEqual(INTERNAL);
  });

  test('any other error stays internal', async () => {
    const result4 = await call({ failure: new Error('connection string'), env });
    expect(result4).toEqual(INTERNAL);
  });

  test('an IGNIS server error stays internal', async () => {
    const failure = getError({ statusCode: 503, message: 'down' });

    const result5 = await call({ failure, env });
    expect(result5).toEqual(INTERNAL);
  });
});

/** A driver error as an ORM wraps it: the SQLSTATE and the row context sit on the `cause`. */
const databaseError = (code: string) => {
  const cause = Object.assign(new Error('duplicate key value violates "Note_title_key"'), {
    code,
    detail: 'Key (title)=(secret-title) already exists.',
    table: 'SecretNote',
    constraint: 'Note_title_key',
  });

  return new Error('Failed query: insert into "SecretNote"', { cause });
};

const DATABASE_ROWS = [
  { sqlState: '23505', code: 'already_exists', message: 'Unique constraint violation' },
  { sqlState: '23503', code: 'failed_precondition', message: 'Foreign key constraint violation' },
  { sqlState: '23001', code: 'failed_precondition', message: 'Restrict constraint violation' },
  { sqlState: '23P01', code: 'failed_precondition', message: 'Exclusion constraint violation' },
  { sqlState: '44000', code: 'failed_precondition', message: 'View check option violation' },
  { sqlState: '23502', code: 'invalid_argument', message: 'Not null constraint violation' },
  { sqlState: '23514', code: 'invalid_argument', message: 'Check constraint violation' },
  { sqlState: '22001', code: 'invalid_argument', message: 'String data too long' },
  { sqlState: '22P02', code: 'invalid_argument', message: 'Invalid text representation' },
  {
    sqlState: '40001',
    code: 'aborted',
    message: 'The request conflicted with a concurrent operation; please retry.',
  },
  {
    sqlState: '40P01',
    code: 'aborted',
    message: 'The request conflicted with a concurrent operation; please retry.',
  },
];

describe('gRPC errors on the wire - database errors', () => {
  test.each(DATABASE_ROWS)(
    'SQLSTATE $sqlState answers $code, with no database detail in production',
    async (row) => {
      const result = await call({ failure: databaseError(row.sqlState), env: 'production' });

      expect(result.body).toEqual({ code: row.code, message: row.message });
    },
  );

  test('development carries the detail a REST request would carry', async () => {
    const result = await call({ failure: databaseError('23505'), env: 'development' });

    expect(result.body).toHaveProperty('code', 'already_exists');
    expect(result.body).toHaveProperty(
      'message',
      [
        'Unique constraint violation',
        'Detail: Key (title)=(secret-title) already exists.',
        'Table: SecretNote',
        'Constraint: Note_title_key',
      ].join('\n'),
    );
  });

  const hidden = [
    { name: 'a SQLSTATE that is not the caller’s fault', failure: databaseError('42P01') },
    {
      name: 'a foreign error with a statusCode and a server SQLSTATE',
      failure: Object.assign(new Error('relation "SecretNote"'), {
        code: '42P01',
        statusCode: 401,
      }),
    },
    {
      name: 'a SQLite constraint, which REST does not classify either',
      failure: Object.assign(new Error('UNIQUE constraint failed: SecretNote.title'), {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      }),
    },
  ];

  test.each(hidden)('$name stays internal', async (row) => {
    const result = await call({ failure: row.failure, env: 'production' });

    expect(result).toEqual(INTERNAL);
  });

  test('a ConnectError with a database cause keeps its own code', async () => {
    const failure = new ConnectError(
      'try later',
      Code.Unavailable,
      undefined,
      undefined,
      databaseError('23505'),
    );
    const result = await call({ failure, env: 'production' });

    expect(result.body).toEqual({ code: 'unavailable', message: 'try later' });
  });
});

describe('gRPC errors - the level a failed RPC is logged at', () => {
  const levelsOf = async (failure: unknown) => {
    LoggerFactory.use({ provider: Logger });
    const log = spyOn(Logger.prototype, 'log');

    try {
      await call({ failure, env: 'production' });

      return log.mock.calls
        .filter(([, message]) => String(message).includes('REQUEST ERROR'))
        .map(([level]) => String(level));
    } finally {
      log.mockRestore();
      LoggerFactory.reset();
    }
  };

  const rows = [
    { statusCode: 401, level: 'warn' },
    { statusCode: 403, level: 'warn' },
    { statusCode: 404, level: 'warn' },
    { statusCode: 400, level: 'error' },
    { statusCode: 409, level: 'error' },
  ];

  test.each(rows)('$statusCode is logged at $level', async (row) => {
    const levels = await levelsOf(getError({ statusCode: row.statusCode, message: 'refused' }));

    expect(levels).toEqual([row.level]);
  });

  test('a Hono HTTPException 403 is logged at warn', async () => {
    const levels = await levelsOf(new HTTPException(403, { message: 'refused' }));

    expect(levels).toEqual(['warn']);
  });

  test('a logLevel the throw site set wins', async () => {
    const failure = getError({ statusCode: 401, message: 'refused', logLevel: 'error' });
    const levels = await levelsOf(failure);

    expect(levels).toEqual(['error']);
  });
});
