import { ApplicationLogger } from '@/helpers/logger';
import { float } from './parse.utility';

const DEFAULT_PERFORMANCE_DECIMAL = 6;

export const getPerformanceCheckpoint = () => {
  return performance.now();
};

export const getExecutedPerformance = (opts: { from: number; digit?: number }) => {
  return float(performance.now() - opts.from, opts.digit ?? DEFAULT_PERFORMANCE_DECIMAL);
};

export const executeWithPerformanceMeasure = <R = any>(opts: {
  logger?: ApplicationLogger;
  description?: string;
  scope: string;
  task: Function;
}) => {
  return new Promise<R>((resolve, reject) => {
    const t = performance.now();
    const { logger = console, scope, description = 'Executing', task } = opts;
    logger.info('[%s] START | %s ...', scope, description);

    Promise.resolve(task())
      .then(resolve)
      .catch(reject)
      .finally(() => {
        logger.info('[%s] DONE | %s | Took: %s (ms)', scope, description, performance.now() - t);
      });
  });
};
