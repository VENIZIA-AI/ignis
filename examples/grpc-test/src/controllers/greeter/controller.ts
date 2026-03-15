import { GreeterService } from "@/services";
import { create } from "@bufbuild/protobuf";
import {
  BaseGrpcController,
  ControllerTransports,
  controller,
  inject,
  unary,
} from "@venizia/ignis";
import {
  GreeterService as GreeterServiceDef,
  ListUsersResponseSchema,
  SayHelloResponseSchema,
  type ListUsersRequest,
  type ListUsersResponse,
  type SayHelloRequest,
  type SayHelloResponse,
} from "./definition";

@controller({
  path: "/grpc",
  transport: ControllerTransports.GRPC,
  service: GreeterServiceDef,
})
export class GreeterController extends BaseGrpcController {
  constructor(
    @inject({ key: "services.GreeterService" })
    private readonly greeterService: GreeterService,
  ) {
    super({ scope: "GreeterController", path: "/grpc" });
  }

  override binding() {}

  // ---------------------------------------------------------------------------
  // 1. Unary — single request → single response
  // ---------------------------------------------------------------------------

  @unary({ configs: { name: "sayHello" } })
  async sayHello(opts: {
    request: SayHelloRequest;
  }): Promise<SayHelloResponse> {
    const message = await this.greeterService.sayHello(opts);
    return create(SayHelloResponseSchema, { message });
  }

  @unary({ configs: { name: "listUsers" } })
  async listUsers(opts: {
    request: ListUsersRequest;
  }): Promise<ListUsersResponse> {
    const users = await this.greeterService.listUsers(opts);
    return create(ListUsersResponseSchema, { users });
  }

  // ---------------------------------------------------------------------------
  // Streaming RPCs — not supported in current version (HTTP/1.1 Connect protocol).
  // @serverStream, @clientStream, @bidiStream decorators will throw at boot time.
  // ---------------------------------------------------------------------------
}
