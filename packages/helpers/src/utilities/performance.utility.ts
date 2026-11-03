import { type AnyType } from '@/common/types';
import { type ILogger } from '@/modules/logger';
import { ParseUtility } from './parse.utility';

const DEFAULT_PERFORMANCE_DECIMAL = 6;

type TLogMethod = (message: string, ...args: Array<AnyType>) => void;

export class PerformanceUtility {
  static getCheckpoint() {
    return performance.now();
  }

  static getExecuted(opts: { from: number; digit?: number }) {
    return ParseUtility.toFloat({
      input: performance.now() - opts.from,
      digit: opts.digit ?? DEFAULT_PERFORMANCE_DECIMAL,
    });
  }

  static executeWithMeasure<R = any>(opts: {
    logger?: ILogger;
    level?: string;
    description?: string;
    args?: any;
    scope: string;
    task: Function;
  }) {
    return new Promise<R>((resolve, reject) => {
      const t = performance.now();
      const {
        logger = console,
        level = 'debug',
        scope,
        description = 'Executing',
        args,
        task,
      } = opts;

      // `level` names a method on whichever logger was passed, so it is looked up, not indexed; the call keeps `this` bound to that logger.
      const method: TLogMethod = Reflect.get(logger, level);
      const log = (message: string, ...params: Array<AnyType>) =>
        method.call(logger, message, ...params);

      if (args) {
        log('[%s] START | %s... | Args: %j', scope, description, args);
      } else {
        log('[%s] START | %s ...', scope, description);
      }

      Promise.resolve(task())
        .then(resolve)
        .catch(reject)
        .finally(() => {
          const took = performance.now() - t;
          if (args) {
            log('[%s] DONE | %s | Args: %j | Took: %s (ms)', scope, description, args, took);
          } else {
            log('[%s] DONE | %s | Took: %s (ms)', scope, description, took);
          }
        });
    });
  }
}
