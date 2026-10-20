/**
 * Re-exports from the generated protobuf code.
 *
 * This file acts as the stable import boundary - controller.ts and external
 * consumers import from here, never from generated/ directly.
 *
 * Regenerate with: bun run proto:gen
 */

export {
  GreeterService,
  SayHelloRequestSchema,
  SayHelloResponseSchema,
  type SayHelloRequest,
  type SayHelloResponse,
} from './generated/greeter_pb';
