import { LoggerFactory } from '@/modules/logger/factory';
import { ExecutionModes } from './common/constants';
import type { IExecutionFrame } from './common/types';

/** The most hand-off names remembered as already warned about; a later one is not logged. */
const MAX_WARNED = 100;

/**
 * @internal The entry of the framework's own frames: listeners, hand-offs and shared loops. It is a class of its own so
 * a bundle that only sleeps does not carry it. Without a runner every method runs the task as it is.
 */
export class ExecutionFrames {
  private static readonly warnedHandOffs = new Set<string>();

  /** Whether a runner is installed, so that frames exist at all. */
  static isInstalled(): boolean {
    return globalThis.ignisExecutionRunner !== undefined;
  }

  /** Runs `task` in exactly this frame and answers what it answers, a synchronous throw included. */
  static run<Result>(opts: { frame: IExecutionFrame; task: () => Result }): Result {
    const runner = globalThis.ignisExecutionRunner;

    return runner ? runner.runFrame(opts) : opts.task();
  }

  /** Runs `task` in a root frame: scoped, with no request and nothing of the caller but the user named here. */
  static root<Result>(opts: { userId?: IExecutionFrame['userId']; task: () => Result }): Result {
    const { userId, task } = opts;

    return ExecutionFrames.run({
      frame: Object.freeze({ mode: ExecutionModes.SCOPED, userId, values: Object.freeze({}) }),
      task,
    });
  }

  /**
   * A listener that starts a root frame at each call, so it never runs with the rights of whoever registered it or
   * emitted to it. Its receiver, arguments and return value are the handler's.
   */
  static listener<This, Args extends unknown[], Result>(opts: {
    handler: (this: This, ...args: Args) => Result;
    userId?: () => IExecutionFrame['userId'];
  }): (this: This, ...args: Args) => Result {
    const { handler, userId } = opts;

    return function (this: This, ...args: Args) {
      return ExecutionFrames.root({
        userId: userId?.(),
        task: () => handler.apply(this, args),
      });
    };
  }

  /**
   * Captures who is running now and answers how to run work handed on to later: in a scoped frame with that user and
   * those values, never with system rights. `isRequestKept` also keeps the request. `name` (a queue, an event) is
   * what a dropped system frame is logged under, once.
   */
  static handOff(opts: {
    name: string;
    isRequestKept?: boolean;
  }): <Result>(task: () => Result) => Result {
    const runner = globalThis.ignisExecutionRunner;

    if (!runner) {
      return (task) => task();
    }

    const current = runner.read();

    if (current?.mode === ExecutionModes.SYSTEM) {
      ExecutionFrames.warnDropped({ name: opts.name });
    }

    const { userId, values } = runner.capture();
    const frame: IExecutionFrame = Object.freeze({
      mode: ExecutionModes.SCOPED,
      request: opts.isRequestKept ? current?.request : undefined,
      userId,
      values: Object.freeze({ ...values }),
    });

    return (task) => ExecutionFrames.run({ frame, task });
  }

  private static warnDropped(opts: { name: string }) {
    const { name } = opts;
    const warned = ExecutionFrames.warnedHandOffs;

    if (warned.has(name) || warned.size >= MAX_WARNED) {
      return;
    }

    warned.add(name);
    LoggerFactory.getLogger([ExecutionFrames.name])
      .for('handOff')
      .warn(
        'Work handed on from a system frame runs scoped: open a system run where it is handled if it needs one | name: %s',
        name,
      );
  }
}
