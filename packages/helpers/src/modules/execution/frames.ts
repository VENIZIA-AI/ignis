import type { ValueOrPromise } from '@/common';
import type { IExecutionFrame } from './common/types';

/**
 * @internal The entry of the framework's own frames. It is a class of its own so a bundle that only sleeps does not
 * carry it.
 */
export class ExecutionFrames {
  /** Whether a runner is installed, so that frames exist at all. */
  static isInstalled(): boolean {
    return globalThis.ignisExecutionRunner !== undefined;
  }

  /** Runs `task` in exactly this frame, and as it is when no runner is installed. */
  static async run<Result>(opts: {
    frame: IExecutionFrame;
    task: () => ValueOrPromise<Result>;
  }): Promise<Result> {
    const runner = globalThis.ignisExecutionRunner;

    return runner ? runner.runFrame(opts) : opts.task();
  }
}
