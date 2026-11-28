import { ExecutionRunner, RequestFrameMiddleware } from '@/base/execution';
import type { Env, Hono, Schema } from 'hono';

/**
 * Execution frames for a test that boots no `BaseApplication`: a repository test, a test preload or a bare Hono app.
 * A `BaseApplication` installs the runner itself and frames the requests of its server, not those of `getRootRouter()`.
 *
 * @example
 * ```typescript
 * import { ExecutionTestHarness } from '@venizia/ignis/testing';
 * import { Hono } from 'hono';
 *
 * const app = ExecutionTestHarness.mount({ app: new Hono() });
 * app.get('/invoices', (context) => context.json([]));
 * ```
 */
export class ExecutionTestHarness {
  /** Installs the execution runner, so `Execution.run` and models with `access` work; safe to call again. */
  static install(): void {
    ExecutionRunner.install();
  }

  /**
   * Installs the runner and runs each request of `app` in a scoped frame. Call it before you add routes: a route added
   * earlier gets no frame.
   */
  static mount<AppEnv extends Env, AppSchema extends Schema, BasePath extends string>(opts: {
    app: Hono<AppEnv, AppSchema, BasePath>;
  }): Hono<AppEnv, AppSchema, BasePath> {
    const { app } = opts;
    ExecutionTestHarness.install();
    app.use(RequestFrameMiddleware.create());

    return app;
  }
}
