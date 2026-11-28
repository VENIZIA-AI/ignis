import type { Context, Env } from 'hono';

/** The idle timeout of the server for one call: `Bun.serve` closes a request that stays quiet for `idleTimeout`. */
export class GrpcTimeoutGuard {
  /**
   * Lifts the idle timeout of this request, so a call may stay quiet for as long as its handler needs. A request with no
   * Bun server behind it (`router.request` in a test) has no timeout to lift.
   */
  static lift<RouteEnv extends Env>(opts: { context: Context<RouteEnv> }) {
    // Hono hands the server as the env of `server.fetch`.
    const server: unknown = opts.context.env;

    if (typeof server !== 'object' || server === null) {
      return;
    }

    const timeout: unknown = Reflect.get(server, 'timeout');

    if (typeof timeout === 'function') {
      Reflect.apply(timeout, server, [opts.context.req.raw, 0]);
    }
  }
}
