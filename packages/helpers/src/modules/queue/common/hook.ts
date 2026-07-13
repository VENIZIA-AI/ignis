import { ValueOrPromise } from '@/common/types';
import type { Logger } from '@/modules/logger';
import { voidExecution } from '@/utilities/promise.utility';

/**
 * Fire-and-forget a user-supplied hook from inside an event listener.
 *
 * `voidExecution` takes a VALUE, so the hook has already run - and possibly thrown SYNCHRONOUSLY -
 * before it can help; inside an emitter callback such a throw is an uncaught exception that takes the
 * process down. Taking a thunk keeps the call inside the guard, and rejections still route to the logger.
 */
export const invokeHook = (opts: {
  logger: Logger;
  scope: string;
  execution: () => ValueOrPromise<unknown>;
}): void => {
  const { logger, scope, execution } = opts;

  try {
    voidExecution({ logger, scope, execution: execution() });
  } catch (error) {
    logger.for(scope).error('Hook execution FAILED | Error: %s', error);
  }
};

/**
 * Await a user-supplied hook, absorbing sync throws and rejections. Use where the hook must complete
 * before the caller continues yet must never be able to break the caller's state machine.
 */
export const awaitHook = async (opts: {
  logger: Logger;
  scope: string;
  execution: () => ValueOrPromise<unknown>;
}): Promise<void> => {
  const { logger, scope, execution } = opts;

  try {
    await execution();
  } catch (error) {
    logger.for(scope).error('Hook execution FAILED | Error: %s', error);
  }
};
