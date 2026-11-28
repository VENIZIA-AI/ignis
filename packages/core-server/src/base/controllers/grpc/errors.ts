import { GRPC, HTTP, type TGrpcResultCode } from '@venizia/ignis-helpers/common';
import { getError, isApplicationError, RecordUtility } from '@venizia/ignis-helpers/core';
import type { Context, Env, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DatabaseErrorCodes, DatabaseErrorHandler } from '@venizia/ignis-kernel';

const CODES = new Map<number, TGrpcResultCode>([
  [HTTP.ResultCodes.RS_4.BadRequest, GRPC.ResultCodes.INVALID_ARGUMENT],
  [HTTP.ResultCodes.RS_4.Unauthorized, GRPC.ResultCodes.UNAUTHENTICATED],
  [HTTP.ResultCodes.RS_4.Forbidden, GRPC.ResultCodes.PERMISSION_DENIED],
  [HTTP.ResultCodes.RS_4.NotFound, GRPC.ResultCodes.NOT_FOUND],
  [HTTP.ResultCodes.RS_4.Conflict, GRPC.ResultCodes.ABORTED],
  [HTTP.ResultCodes.RS_4.UnprocessableEntity, GRPC.ResultCodes.INVALID_ARGUMENT],
  [HTTP.ResultCodes.RS_4.TooManyRequests, GRPC.ResultCodes.RESOURCE_EXHAUSTED],
]);

/** The database errors a REST request answers 400 for, whose gRPC code says more than `invalid_argument`. */
const DATABASE_CODES = new Map<string, TGrpcResultCode>([
  [DatabaseErrorCodes.UNIQUE_VIOLATION, GRPC.ResultCodes.ALREADY_EXISTS],
  [DatabaseErrorCodes.FOREIGN_KEY_VIOLATION, GRPC.ResultCodes.FAILED_PRECONDITION],
  [DatabaseErrorCodes.CONSTRAINT_VIOLATION, GRPC.ResultCodes.FAILED_PRECONDITION],
]);

/**
 * What a thrown error becomes for a gRPC client. The status and the message are the ones the server's error handler
 * answers a REST request with, so one policy decides what a client may read.
 */
export class GrpcErrors {
  /** The reason `rpc.signal` gets when the native port stops: a client reads `unavailable`, and may try again. */
  static shuttingDown(opts: { connect: object }): unknown {
    const ConnectError: unknown = Reflect.get(opts.connect, 'ConnectError');

    if (typeof ConnectError !== 'function') {
      return undefined;
    }

    return Reflect.construct(ConnectError, [
      'The server is shutting down',
      GRPC.ResultCodes.UNAVAILABLE,
    ]);
  }

  /** The error of a call a middleware answered: a 4xx answer keeps its status, so its code; any other is `internal`. */
  static endedByMiddleware(opts: { status: number }) {
    const isClientError =
      opts.status >= HTTP.ResultCodes.RS_4.BadRequest &&
      opts.status < HTTP.ResultCodes.RS_5.InternalServerError;

    return getError({
      statusCode: isClientError ? opts.status : HTTP.ResultCodes.RS_5.InternalServerError,
      message: 'A middleware ended the call',
    });
  }

  /** The error of a call a middleware neither passed on nor answered: `internal`. */
  static notPassed() {
    return getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: 'A middleware did not call next()',
    });
  }

  /**
   * A client error (4xx) thrown as `getError`'s error or as Hono's `HTTPException`, and a database error a REST request
   * answers 400 or 409 for, becomes a `ConnectError` of the loaded ConnectRPC module, with its code and public message.
   * Anything else, a `ConnectError` the application threw included, is answered as it is: ConnectRPC keeps its own error
   * and hides the rest behind `internal`.
   */
  static async toAnswer<RouteEnv extends Env>(opts: {
    error: unknown;
    context: Context<RouteEnv>;
    connect: object;
    handle: ErrorHandler;
  }): Promise<unknown> {
    const { error, context, connect, handle } = opts;
    const ConnectError: unknown = Reflect.get(connect, 'ConnectError');

    // The application's own choice of code stands, whatever its `cause` is.
    if (typeof ConnectError !== 'function' || error instanceof ConnectError) {
      return error;
    }

    // Only the framework's own errors and the database errors it classifies: another library's `statusCode` and text
    // were not written for this caller.
    const isAnswerable =
      isApplicationError(error) ||
      error instanceof HTTPException ||
      (error instanceof Error && GrpcErrors.isDatabaseError({ error }));

    if (!isAnswerable) {
      return error;
    }

    const response = await handle(error, context);

    if (
      response.status < HTTP.ResultCodes.RS_4.BadRequest ||
      response.status >= HTTP.ResultCodes.RS_5.InternalServerError
    ) {
      return error;
    }

    const body: unknown = await response.json();
    const message = RecordUtility.isRecord(body) ? body.message : undefined;
    const databaseCode =
      response.status === HTTP.ResultCodes.RS_4.BadRequest
        ? DATABASE_CODES.get(GrpcErrors.readMessageCode({ body }))
        : undefined;
    const code = databaseCode ?? CODES.get(response.status) ?? GRPC.ResultCodes.FAILED_PRECONDITION;

    return Reflect.construct(ConnectError, [String(message), code]);
  }

  /** True for a database error the error handler answers 400 or 409. */
  private static isDatabaseError(opts: { error: Error }): boolean {
    const { error } = opts;

    // Only the classification is read here: the handler writes the message, for its own environment.
    const { isClientError } = DatabaseErrorHandler.isDatabaseClientError({
      error,
      isProduction: true,
    });

    return isClientError || DatabaseErrorHandler.isRetryableDatabaseError({ error });
  }

  /** The `normalized.code` of an error response, or an empty string. */
  private static readMessageCode(opts: { body: unknown }): string {
    const normalized = RecordUtility.isRecord(opts.body) ? opts.body.normalized : undefined;
    const code = RecordUtility.isRecord(normalized) ? normalized.code : undefined;

    return typeof code === 'string' ? code : '';
  }
}
