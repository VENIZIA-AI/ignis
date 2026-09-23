import { GreeterService } from '@/services/greeter.service';
import { create } from '@bufbuild/protobuf';
import {
  BaseGrpcController,
  ControllerTransports,
  controller,
  inject,
  unary,
} from '@venizia/ignis';
import {
  GreeterService as GreeterServiceDef,
  SayHelloResponseSchema,
  type SayHelloRequest,
  type SayHelloResponse,
} from './definition';

@controller({
  path: '/grpc',
  transport: ControllerTransports.GRPC,
  service: GreeterServiceDef,
})
export class GreeterController extends BaseGrpcController {
  constructor(
    @inject({ key: 'services.GreeterService' })
    private readonly greeterService: GreeterService,
  ) {
    super({ scope: 'GreeterController', path: '/grpc' });
  }

  override binding() {}

  // Unary RPC - the only method kind the current Connect protocol (HTTP/1.1) supports.
  @unary({ configs: { name: 'sayHello' } })
  async sayHello(opts: { request: SayHelloRequest }): Promise<SayHelloResponse> {
    const message = await this.greeterService.sayHello(opts);
    return create(SayHelloResponseSchema, { message });
  }
}
