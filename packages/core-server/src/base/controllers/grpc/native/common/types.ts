import type {
  UniversalHandler,
  UniversalServerRequest,
  UniversalServerResponse,
} from '@connectrpc/connect/protocol';
import type { ContextValues } from '@connectrpc/connect';
import type { TToggle } from '@venizia/ignis-kernel';
import type { Http2ServerRequest, Http2ServerResponse } from 'node:http2';

/** The TLS of the native gRPC port: `{ use: false }` is clear text (h2c), for a mesh or a TLS-terminating proxy. */
export type TGrpcNativeTls = TToggle<{ key: string | Buffer; cert: string | Buffer }>;

/** The native gRPC port: a `node:http2` listener beside the HTTP server, off unless `use` is true. */
export interface IGrpcNativeOptions {
  /** `0` takes a free port, read back from the listener's `getAddress()`. */
  port: number;
  /** Default `127.0.0.1`: a clear-text port is not public unless you say so. */
  host?: string;
  /** Default `{ use: false }`. */
  tls?: TGrpcNativeTls;
  /** How long `stop()` waits for calls in flight before it aborts them, in milliseconds. Default 10 000. */
  shutdownTimeout?: number;
  limits?: {
    /** Streams one connection may have open at once. A positive integer, default 100. */
    concurrentStreams?: number;
  };
}

/**
 * The two functions of `@connectrpc/connect-node` the native port needs. Declared here, as methods, so an application
 * without that optional peer still type-checks and the real module can be passed in.
 */
export interface IConnectNodeModule {
  universalRequestFromNodeRequest(
    request: Http2ServerRequest,
    response: Http2ServerResponse,
    parsedJsonBody: undefined,
    contextValues: ContextValues,
  ): UniversalServerRequest;
  universalResponseToNodeResponse(
    universalResponse: UniversalServerResponse,
    response: Http2ServerResponse,
  ): Promise<void>;
}

/** One native gRPC request, as `node:http2` gives it. */
export interface IGrpcNativeCall {
  request: Http2ServerRequest;
  response: Http2ServerResponse;
}

/** What the native writer answers a call with. */
export interface IGrpcNativeAnswer {
  call: IGrpcNativeCall;
  handler: UniversalHandler;
  contextValues: ContextValues;
  /** The headers earlier middleware set, merged into the answer. */
  headers: Headers;
  node: IConnectNodeModule;
}
