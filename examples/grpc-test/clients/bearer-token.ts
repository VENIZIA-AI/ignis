import type { Interceptor } from '@connectrpc/connect';

/** A client interceptor: sends the token as `authorization: Bearer <token>`, the header gRPC calls metadata. */
export class BearerToken {
  static interceptor(opts: { read: () => string | undefined }): Interceptor {
    return (next) => (request) => {
      const token = opts.read();

      if (token) {
        request.header.set('authorization', `Bearer ${token}`);
      }

      return next(request);
    };
  }
}
