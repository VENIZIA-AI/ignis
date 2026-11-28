import type { IncomingHttpHeaders } from 'node:http2';

/** The headers of a native gRPC call: from the node request to Hono, and from Hono into the answer. */
export class GrpcHeaderUtility {
  /** The headers of a node request, without the `:` pseudo headers of HTTP/2. */
  static fromNode(opts: { headers: IncomingHttpHeaders }): Headers {
    const headers = new Headers();

    for (const [name, value] of Object.entries(opts.headers)) {
      if (name.startsWith(':') || value === undefined) {
        continue;
      }

      for (const entry of Array.isArray(value) ? value : [value]) {
        headers.append(name, entry);
      }
    }

    return headers;
  }

  /** Adds to an answer the headers it does not set itself. The content type is the protocol's own. */
  static merge(opts: { from: Headers; into: Headers }) {
    const own = new Set(opts.into.keys());

    for (const [name, value] of opts.from) {
      if (name !== 'content-type' && !own.has(name)) {
        opts.into.append(name, value);
      }
    }
  }
}
