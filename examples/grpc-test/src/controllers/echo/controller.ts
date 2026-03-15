import { create } from "@bufbuild/protobuf";
import {
  BaseGrpcController,
  ControllerTransports,
  controller,
  unary,
} from "@venizia/ignis";
import {
  EchoResponseSchema,
  EchoService as EchoServiceDef,
  type EchoRequest,
  type EchoResponse,
} from "./definition";

@controller({
  path: "/grpc",
  transport: ControllerTransports.GRPC,
  service: EchoServiceDef,
})
export class EchoController extends BaseGrpcController {
  constructor() {
    super({ scope: "EchoController", path: "/grpc" });
  }

  override binding() {}

  @unary({ configs: { name: "echo" } })
  async echo(opts: { request: EchoRequest }): Promise<EchoResponse> {
    return create(EchoResponseSchema, {
      message: `Echo: ${opts.request.message}`,
    });
  }
}
