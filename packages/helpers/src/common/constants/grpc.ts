import { ValueOf } from '../types';

export class GRPC {
  /** Standard gRPC methods (lowercase). */
  static readonly Methods = {
    UNARY: 'unary',
    SERVER_STREAMING: 'server_streaming',
    CLIENT_STREAMING: 'client_streaming',
    BIDI_STREAMING: 'bidi_streaming',
  } as const;

  /** Standard gRPC protocol headers (PROTOCOL-HTTP2.md). */
  static readonly Headers = {
    CONTENT_TYPE: 'content-type',
    TE: 'te',
    USER_AGENT: 'user-agent',

    GRPC_TIMEOUT: 'grpc-timeout',
    GRPC_ENCODING: 'grpc-encoding',
    GRPC_ACCEPT_ENCODING: 'grpc-accept-encoding',
    GRPC_MESSAGE_TYPE: 'grpc-message-type',

    GRPC_STATUS: 'grpc-status',
    GRPC_MESSAGE: 'grpc-message',
    GRPC_STATUS_DETAILS_BIN: 'grpc-status-details-bin',

    GRPC_PREVIOUS_RPC_ATTEMPTS: 'grpc-previous-rpc-attempts',
    GRPC_RETRY_PUSHBACK_MS: 'grpc-retry-pushback-ms',

    GRPC_TRACE_BIN: 'grpc-trace-bin',
    GRPC_TAGS_BIN: 'grpc-tags-bin',
  } as const;

  /** gRPC MIME / Content-Type values. */
  static readonly HeaderValues = {
    GRPC: 'application/grpc',
    GRPC_PROTO: 'application/grpc+proto',
    GRPC_JSON: 'application/grpc+json',
    GRPC_WEB: 'application/grpc-web',
    GRPC_WEB_PROTO: 'application/grpc-web+proto',
    GRPC_WEB_JSON: 'application/grpc-web+json',
    GRPC_WEB_TEXT: 'application/grpc-web-text',
  } as const;

  /** Standard gRPC status codes (google.rpc.Code). */
  static readonly ResultCodes = {
    OK: 0,
    CANCELLED: 1,
    UNKNOWN: 2,
    INVALID_ARGUMENT: 3,
    DEADLINE_EXCEEDED: 4,
    NOT_FOUND: 5,
    ALREADY_EXISTS: 6,
    PERMISSION_DENIED: 7,
    RESOURCE_EXHAUSTED: 8,
    FAILED_PRECONDITION: 9,
    ABORTED: 10,
    OUT_OF_RANGE: 11,
    UNIMPLEMENTED: 12,
    INTERNAL: 13,
    UNAVAILABLE: 14,
    DATA_LOSS: 15,
    UNAUTHENTICATED: 16,
  } as const;
}

export type TGrpcMethod = ValueOf<typeof GRPC.Methods>;
export type TGrpcResultCode = ValueOf<typeof GRPC.ResultCodes>;
