import { HealthService } from "@/services";
import { create } from "@bufbuild/protobuf";
import {
  BaseGrpcController,
  ControllerTransports,
  controller,
  inject,
  unary,
} from "@venizia/ignis";
import {
  HealthService as HealthServiceDef,
  PongResponseSchema,
  type PingRequest,
  type PongResponse,
} from "./definition";

@controller({
  path: "/grpc",
  transport: ControllerTransports.GRPC,
  service: HealthServiceDef,
})
export class HealthController extends BaseGrpcController {
  constructor(
    @inject({ key: "services.HealthService" })
    private readonly healthService: HealthService,
  ) {
    super({ scope: "HealthController", path: "/grpc" });
  }

  override binding() {}

  @unary({ configs: { name: "ping" } })
  async ping(opts: { request: PingRequest }): Promise<PongResponse> {
    const result = await this.healthService.ping(opts);
    return create(PongResponseSchema, result);
  }
}
