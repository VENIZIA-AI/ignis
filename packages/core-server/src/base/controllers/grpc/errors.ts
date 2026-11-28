import { GRPC, HTTP, type TGrpcResultCode } from '@venizia/ignis-helpers/common';
import { isApplicationError, RecordUtility } from '@venizia/ignis-helpers/core';
import type { Context, Env, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

const CODES = new Map<number, TGrpcResultCode>([
  [HTTP.ResultCodes.RS_4.BadRequest, GRPC.ResultCodes.INVALID_ARGUMENT],
  [HTTP.ResultCodes.RS_4.Unauthorized, GRPC.ResultCodes.UNAUTHENTICATED],
  [HTTP.ResultCodes.RS_4.Forbidden, GRPC.ResultCodes.PERMISSION_DENIED],
  [HTTP.ResultCodes.RS_4.NotFound, GRPC.ResultCodes.NOT_FOUND],
  [HTTP.ResultCodes.RS_4.Conflict, GRPC.ResultCodes.ABORTED],
  [HTTP.ResultCodes.RS_4.UnprocessableEntity, GRPC.ResultCodes.INVALID_ARGUMENT],
  [HTTP.ResultCodes.RS_4.TooManyRequests, GRPC.ResultCodes.RESOURCE_EXHAUSTED],
]);

/**
 * What a thrown error becomes for a gRPC client. The status and the message are the ones the server's error handler
 * answers a REST request with, so one policy decides what a client may read.
 */
export class GrpcErrors {
  /**
   * A client error (4xx) thrown as `getError`'s error or as Hono's `HTTPException` becomes a `ConnectError` of the
   * loaded ConnectRPC module, with its code and public message. Anything else, a `ConnectError` the application threw
   * included, is answered as it is: ConnectRPC keeps its own error and hides the rest behind `internal`.
   */
  static async toAnswer<RouteEnv extends Env>(opts: {
    error: unknown;
    context: Context<RouteEnv>;
    connect: object;
    handle: ErrorHandler;
  }): Promise<unknown> {
    const { error, context, connect, handle } = opts;
    const ConnectError: unknown = Reflect.get(connect, 'ConnectError');

    // Only the framework's own errors: another library's `statusCode` and text were not written for this caller.
    const isFrameworkError = isApplicationError(error) || error instanceof HTTPException;

    if (typeof ConnectError !== 'function' || !isFrameworkError) {
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
    const code = CODES.get(response.status) ?? GRPC.ResultCodes.FAILED_PRECONDITION;

    return Reflect.construct(ConnectError, [String(message), code]);
  }
}
