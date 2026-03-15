import { create } from "@bufbuild/protobuf";
import {
  BaseGrpcController,
  ControllerTransports,
  controller,
  unary,
} from "@venizia/ignis";
import {
  GetTimeResponseSchema,
  TimeService as TimeServiceDef,
  type GetTimeRequest,
  type GetTimeResponse,
} from "./definition";

@controller({
  path: "/grpc",
  transport: ControllerTransports.GRPC,
  service: TimeServiceDef,
})
export class TimeController extends BaseGrpcController {
  constructor() {
    super({ scope: "TimeController", path: "/grpc" });
  }

  override binding() {}

  @unary({ configs: { name: "getTime" } })
  async getTime(opts: { request: GetTimeRequest }): Promise<GetTimeResponse> {
    const tz =
      opts.request.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    return create(GetTimeResponseSchema, {
      timestamp: new Date().toISOString(),
      timezone: tz,
    });
  }
}
