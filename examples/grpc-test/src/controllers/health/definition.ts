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
  HealthService,
  // Unary — Ping
  PingRequestSchema,
  PongResponseSchema,
  type PingRequest,
  type PongResponse,
} from "./generated/health_pb";
