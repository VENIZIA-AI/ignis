/**
 * Re-exports from the generated protobuf code.
 *
 * This file acts as the stable import boundary — controller.ts and external
 * consumers import from here, never from gen/ directly.
 *
 * Regenerate with: bun run proto:gen
 */

export {
  // Service
  GreeterService,
  // Unary — SayHello
  SayHelloRequestSchema,
  SayHelloResponseSchema,
  type SayHelloRequest,
  type SayHelloResponse,
  // Unary — ListUsers
  ListUsersRequestSchema,
  ListUsersResponseSchema,
  UserSchema,
  type ListUsersRequest,
  type ListUsersResponse,
  type User,
  // Server streaming — StreamEvents
  StreamEventsRequestSchema,
  EventSchema,
  type StreamEventsRequest,
  type Event,
  // Client streaming — CollectLogs
  LogEntrySchema,
  LogSummarySchema,
  type LogEntry,
  type LogSummary,
  // Bidi streaming — Chat
  ChatMessageSchema,
  ChatResponseSchema,
  type ChatMessage,
  type ChatResponse,
} from "./generated/greeter_pb";
