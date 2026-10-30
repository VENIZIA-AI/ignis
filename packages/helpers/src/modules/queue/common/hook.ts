import { type ValueOrPromise } from '@/common/types';
import type { ILogger } from '@/modules/logger';
import { PromiseUtility } from '@/utilities/promise.utility';

export class HookUtility {
  /** Fire-and-forget a hook from inside an event listener. Takes a thunk because `PromiseUtility.voidExecution` takes a VALUE - a synchronous throw would escape the guard and, inside an emitter callback, take the process down. Rejections still route to the logger. */
  static invoke(opts: {
    logger: ILogger;
    scope: string;
    execution: () => ValueOrPromise<unknown>;
  }): void {
    const { logger, scope, execution } = opts;

    try {
      PromiseUtility.voidExecution({ logger, scope, execution: execution() });
    } catch (error) {
      logger.for(scope).error('Hook execution FAILED | Error: %s', error);
    }
  }

  /** Await a user-supplied hook, absorbing sync throws and rejections without breaking the caller's state machine. */
  static async execute(opts: {
    logger: ILogger;
    scope: string;
    execution: () => ValueOrPromise<unknown>;
  }): Promise<void> {
    const { logger, scope, execution } = opts;

    try {
      await execution();
    } catch (error) {
      logger.for(scope).error('Hook execution FAILED | Error: %s', error);
    }
  }
}

/** @deprecated Use HookUtility.invoke({ logger, scope, execution }). Removed in 0.5. */
export const invokeHook = (opts: {
  logger: ILogger;
  scope: string;
  execution: () => ValueOrPromise<unknown>;
}): void => HookUtility.invoke(opts);

/** @deprecated Use HookUtility.execute({ logger, scope, execution }). Removed in 0.5. */
export const awaitHook = (opts: {
  logger: ILogger;
  scope: string;
  execution: () => ValueOrPromise<unknown>;
}): Promise<void> => HookUtility.execute(opts);
