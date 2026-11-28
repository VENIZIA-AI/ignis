import type { IGrpcNativeCall } from './common/types';

/**
 * The env of `app.fetch` for a native gRPC request: it carries the node stream to the route, and answers
 * `requestIP`, which `hono/bun`'s `getConnInfo` reads, so an IP rate limit or a log sees the caller's address.
 * An instance is only made by the listener, so no request of the HTTP server can pass for one.
 */
export class GrpcNativeCallStore {
  constructor(readonly call: IGrpcNativeCall) {}

  /** The native call of a request, or `undefined` for a request of the HTTP server. */
  static read(opts: { env: unknown }): IGrpcNativeCall | undefined {
    return opts.env instanceof GrpcNativeCallStore ? opts.env.call : undefined;
  }

  requestIP() {
    const socket = this.call.request.stream.session?.socket;

    if (!socket?.remoteAddress) {
      return null;
    }

    return {
      address: socket.remoteAddress,
      family: socket.remoteFamily,
      port: socket.remotePort,
    };
  }
}
