import { ExecutionFrames, ExecutionModes } from '@venizia/ignis-helpers/core';
import type { MiddlewareHandler } from 'hono';

/**
 * Makes every request a frame of its own: scoped, with the request, and nothing taken from around it. The user is not
 * copied: it is read from the request when it is needed, so an authentication that runs later is seen.
 */
export class RequestFrameMiddleware {
  static create(): MiddlewareHandler {
    return (context, next) => {
      return ExecutionFrames.run({
        frame: Object.freeze({
          mode: ExecutionModes.SCOPED,
          request: context,
          values: Object.freeze({}),
        }),
        task: next,
      });
    };
  }
}
