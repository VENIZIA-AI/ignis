import { GreeterService } from "@/services";
import { create } from "@bufbuild/protobuf";
import {
  BaseGrpcController,
  ControllerTransports,
  bidiStream,
  clientStream,
  controller,
  inject,
  serverStream,
  unary,
} from "@venizia/ignis";
import {
  ChatResponseSchema,
  EventSchema,
  GreeterService as GreeterServiceDef,
  ListUsersResponseSchema,
  LogSummarySchema,
  SayHelloResponseSchema,
  type ChatMessage,
  type ChatResponse,
  type Event,
  type ListUsersRequest,
  type ListUsersResponse,
  type LogEntry,
  type LogSummary,
  type SayHelloRequest,
  type SayHelloResponse,
  type StreamEventsRequest,
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
  // 2. Server streaming — single request → stream of responses
  // ---------------------------------------------------------------------------

  @serverStream({ configs: { name: "streamEvents" } })
  async *streamEvents(opts: {
    request: StreamEventsRequest;
  }): AsyncGenerator<Event> {
    for await (const event of this.greeterService.streamEvents(opts)) {
      yield create(EventSchema, event);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Client streaming — stream of requests → single response
  // ---------------------------------------------------------------------------

  @clientStream({ configs: { name: "collectLogs" } })
  async collectLogs(opts: {
    request: AsyncIterable<LogEntry>;
  }): Promise<LogSummary> {
    const summary = await this.greeterService.collectLogs(opts);
    return create(LogSummarySchema, summary);
  }

  // ---------------------------------------------------------------------------
  // 4. Bidi streaming — stream of requests ↔ stream of responses
  // ---------------------------------------------------------------------------

  @bidiStream({ configs: { name: "chat" } })
  async *chat(opts: {
    request: AsyncIterable<ChatMessage>;
  }): AsyncGenerator<ChatResponse> {
    for await (const response of this.greeterService.chat(opts)) {
      yield create(ChatResponseSchema, response);
    }
  }
}
