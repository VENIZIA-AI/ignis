import { ApplicationLogger } from "@/helpers/logger";
import { float } from "./parse.utility";

const DEFAULT_PERFORMANCE_DECIMAL = 6;

export const getPerformanceCheckpoint = () => {
  return performance.now();
};

export const getExecutedPerformance = (opts: { from: number; digit?: number }) => {
  return float(performance.now() - opts.from, opts.digit ?? DEFAULT_PERFORMANCE_DECIMAL);
};

export const executeWithPerformanceMeasure = <R = any>(opts: {
  logger?: ApplicationLogger;
  level?: string;
  description?: string;
  args?: any;
  scope: string;
  task: Function;
}) => {
  return new Promise<R>((resolve, reject) => {
    const t = performance.now();
    const {
      logger = console,
      level = "debug",
      scope,
      description = "Executing",
      args,
      task,
    } = opts;

    if (args) {
      logger?.[level]("[%s] START | %s... | Args: %j", scope, description, args);
    } else {
      logger?.[level]("[%s] START | %s ...", scope, description);
    }

    Promise.resolve(task())
      .then(resolve)
      .catch(reject)
      .finally(() => {
        const took = performance.now() - t;
        if (args) {
          logger?.[level](
            "[%s] DONE | %s | Args: %j | Took: %s (ms)",
            scope,
            description,
            args,
            took,
          );
        } else {
          logger?.[level]("[%s] DONE | %s | Took: %s (ms)", scope, description, took);
        }
      });
  });
};
