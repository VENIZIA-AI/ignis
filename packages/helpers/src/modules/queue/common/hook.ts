import { ValueOrPromise } from '@/common/types';
import type { ILogger } from '@/modules/logger';
import { voidExecution } from '@/utilities/promise.utility';

/** Fire-and-forget a hook from inside an event listener. Takes a thunk because `voidExecution` takes a VALUE - a synchronous throw would escape the guard and, inside an emitter callback, take the process down. Rejections still route to the logger. */
export const invokeHook = (opts: {
  logger: ILogger;
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

/** Await a user-supplied hook, absorbing sync throws and rejections without breaking the caller's state machine. */
export const awaitHook = async (opts: {
  logger: ILogger;
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
