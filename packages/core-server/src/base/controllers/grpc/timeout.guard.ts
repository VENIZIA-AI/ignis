import type { Context, Env } from 'hono';

/** The idle timeout of the server for one call: `Bun.serve` closes a request that stays quiet for `idleTimeout`. */
export class GrpcTimeoutGuard {
  /** `Bun.serve`'s own default `idleTimeout`, in seconds. */
  static readonly DEFAULT_IDLE_TIMEOUT_SECONDS = 10;

  /**
   * Lifts the idle timeout of this request, so a call may stay quiet for as long as its handler needs. A request with no
   * Bun server behind it (`router.request` in a test) has no timeout to lift. Call `restore` when the call ends.
   */
  static lift<RouteEnv extends Env>(opts: { context: Context<RouteEnv> }) {
    GrpcTimeoutGuard.set({ context: opts.context, seconds: 0 });
  }

  /**
   * Gives the connection its idle timeout back. The value stays on the socket, which a keep-alive client uses again, and
   * Bun applies it only when set before the response ends.
   */
  static restore<RouteEnv extends Env>(opts: { context: Context<RouteEnv>; seconds: number }) {
    GrpcTimeoutGuard.set(opts);
  }

  private static set<RouteEnv extends Env>(opts: { context: Context<RouteEnv>; seconds: number }) {
    // Hono hands the server as the env of `server.fetch`.
    const server: unknown = opts.context.env;

    if (typeof server !== 'object' || server === null) {
      return;
    }

    const timeout: unknown = Reflect.get(server, 'timeout');

    if (typeof timeout === 'function') {
      Reflect.apply(timeout, server, [opts.context.req.raw, opts.seconds]);
    }
  }
}
