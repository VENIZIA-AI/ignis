import { GRPC, HTTP, type TGrpcResultCode } from '@venizia/ignis-helpers/common';

/** The gRPC codes of the HTTP statuses a native call can be refused with. */
export class GrpcStatusUtility {
  /**
   * The gRPC code of an HTTP answer a call got before it reached ConnectRPC: the table of the gRPC specification, which
   * a client of the HTTP port applies too.
   */
  static fromHttp(opts: { status: number }): TGrpcResultCode {
    const codes = new Map<number, TGrpcResultCode>([
      [HTTP.ResultCodes.RS_4.BadRequest, GRPC.ResultCodes.INTERNAL],
      [HTTP.ResultCodes.RS_4.Unauthorized, GRPC.ResultCodes.UNAUTHENTICATED],
      [HTTP.ResultCodes.RS_4.Forbidden, GRPC.ResultCodes.PERMISSION_DENIED],
      [HTTP.ResultCodes.RS_4.NotFound, GRPC.ResultCodes.UNIMPLEMENTED],
      [HTTP.ResultCodes.RS_4.TooManyRequests, GRPC.ResultCodes.UNAVAILABLE],
      [HTTP.ResultCodes.RS_5.BadGateway, GRPC.ResultCodes.UNAVAILABLE],
      [HTTP.ResultCodes.RS_5.ServiceUnavailable, GRPC.ResultCodes.UNAVAILABLE],
      [HTTP.ResultCodes.RS_5.GatewayTimeout, GRPC.ResultCodes.UNAVAILABLE],
    ]);

    return codes.get(opts.status) ?? GRPC.ResultCodes.UNKNOWN;
  }
}
