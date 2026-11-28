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

  /**
   * The headers of an HTTP answer a trailers-only refusal keeps (a request id, `retry-after`): not the ones that
   * describe its body or its HTTP/1.1 connection, which HTTP/2 refuses.
   */
  static toRefusal(opts: { headers: Headers }) {
    const dropped = new Set([
      'connection',
      'content-encoding',
      'content-length',
      'content-type',
      'http2-settings',
      'keep-alive',
      'proxy-connection',
      'set-cookie',
      'te',
      'transfer-encoding',
      'upgrade',
    ]);
    const kept: Record<string, string | string[]> = {};

    for (const [name, value] of opts.headers) {
      if (!dropped.has(name)) {
        kept[name] = value;
      }
    }

    const cookies = opts.headers.getSetCookie();

    if (cookies.length > 0) {
      kept['set-cookie'] = cookies;
    }

    return kept;
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
