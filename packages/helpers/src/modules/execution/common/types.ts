import type { ValueOrPromise } from '@/common';
import type { ExecutionModes, TExecutionMode } from './constants';

/** The values a frame carries. An application declares its keys by module augmentation. */
export interface IExecutionValues {}

/** Who is running: one web request, one job, one piece of system work. */
export interface IExecutionFrame {
  readonly mode: TExecutionMode;
  /** The request of the frame, opaque here: the server layer reads it as its request context. */
  readonly request?: unknown;
  /** Who the work is done for. */
  readonly userId?: string | number | bigint;
  /** Why a system frame sees everything. */
  readonly reason?: string;
  readonly values: Readonly<Partial<IExecutionValues>>;
}

/** What `Execution.run` takes: the parameters depend on `mode`. */
export type TExecutionRunOptions<Result> =
  | {
      mode: typeof ExecutionModes.SCOPED;
      reason?: never;
      values?: Partial<IExecutionValues>;
      userId?: string | number | bigint;
      /** Start from nothing: no request, user or values of the caller. For a listener of your own. */
      isRoot?: boolean;
      task: () => ValueOrPromise<Result>;
    }
  | {
      mode: typeof ExecutionModes.SYSTEM;
      values?: never;
      isRoot?: never;
      /** A fixed sentence that names the work, for the log. A blank one is refused. */
      reason: string;
      userId?: string | number | bigint;
      task: () => ValueOrPromise<Result>;
    };

declare global {
  /** The installed runner: one per realm, whatever the number of copies of this package. `Execution` writes it. */
  // eslint-disable-next-line no-var -- only `var` declares a property of `globalThis`
  var ignisExecutionRunner: IExecutionRunner | undefined;
}

/** What holds the current frame. The server layer installs one; a host without it runs unframed. */
export interface IExecutionRunner {
  read(): IExecutionFrame | undefined;
  /** The identity a hand-off carries: the user (the request's when the frame names none) and the values. */
  capture(): Pick<IExecutionFrame, 'userId' | 'values'>;
  /** Builds the frame of `Execution.run` from these options and the current one, then runs the task in it. */
  run<Result>(opts: TExecutionRunOptions<Result>): Promise<Result>;
  /** Runs the task in exactly this frame. */
  runFrame<Result>(opts: {
    frame: IExecutionFrame;
    task: () => ValueOrPromise<Result>;
  }): Promise<Result>;
}
