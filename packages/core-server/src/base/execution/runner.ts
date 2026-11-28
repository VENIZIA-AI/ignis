import { BaseHelper } from '@venizia/ignis-helpers';
import {
  Execution,
  ExecutionFrames,
  ExecutionModes,
  getError,
  type IExecutionFrame,
  type IExecutionRunner,
  type TExecutionRunOptions,
} from '@venizia/ignis-helpers/core';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { RecordUtility } from '@venizia/ignis-helpers/core';
import { Authentication, RequestContextRegistry } from '@venizia/ignis-kernel';
import { routePath } from 'hono/route';
import { AsyncLocalStorage } from 'node:async_hooks';

/** The most reasons, and call sites, remembered as already warned about; a later one is not logged. */
const MAX_WARNED = 100;

/**
 * Holds the current execution frame in an `AsyncLocalStorage`. An application installs it when it is built; a script
 * or a test that has no application calls `ExecutionRunner.install()`. A promise left running after its `run`
 * returned keeps the frame it was started in.
 */
export class ExecutionRunner extends BaseHelper implements IExecutionRunner {
  private readonly store = new AsyncLocalStorage<IExecutionFrame>();
  private readonly warnedReasons = new Set<string>();
  private readonly warnedRoots = new Set<string>();

  constructor() {
    super({ scope: ExecutionRunner.name });
  }

  /** Installs the runner. The first install of the process wins; a later one changes nothing. */
  static install(): void {
    if (!ExecutionFrames.isInstalled()) {
      Execution.setRunner({ runner: new ExecutionRunner() });
    }
  }

  /**
   * The identity a hand-off carries: the user and values of the current frame, the user of its request when the frame
   * names none.
   */
  static capture(): Pick<IExecutionFrame, 'userId' | 'values'> {
    return ExecutionRunner.identityOf({ frame: Execution.current() });
  }

  private static identityOf(opts: {
    frame?: IExecutionFrame;
  }): Pick<IExecutionFrame, 'userId' | 'values'> {
    const { frame } = opts;

    return {
      userId: frame?.userId ?? ExecutionRunner.requestUserOf({ frame }),
      values: frame?.values ?? {},
    };
  }

  private static requestUserOf(opts: { frame?: IExecutionFrame }) {
    if (opts.frame?.request === undefined) {
      return undefined;
    }

    const userId: unknown = RequestContextRegistry.resolve()?.get(Authentication.AUDIT_USER_ID);
    const isId =
      typeof userId === 'string' || typeof userId === 'number' || typeof userId === 'bigint';

    return isId ? userId : undefined;
  }

  read(): IExecutionFrame | undefined {
    return this.store.getStore();
  }

  capture(): Pick<IExecutionFrame, 'userId' | 'values'> {
    return ExecutionRunner.identityOf({ frame: this.read() });
  }

  async run<Result>(opts: TExecutionRunOptions<Result>): Promise<Result> {
    return this.runFrame({
      frame: this.buildFrame({ options: opts, parent: this.read() }),
      task: opts.task,
    });
  }

  runFrame<Result>(opts: {
    frame: IExecutionFrame;
    task: () => ValueOrPromise<Result>;
  }): Promise<Result> {
    const { frame, task } = opts;
    this.assertFrame({ frame });
    const parent = this.read();

    return this.store.run(frame, async () => {
      // Inside the frame, so the request the line names is the frame's own.
      this.logSystemRun({ frame, parent });

      return task();
    });
  }

  private buildFrame<Result>(opts: {
    options: TExecutionRunOptions<Result>;
    parent?: IExecutionFrame;
  }): IExecutionFrame {
    const { options, parent } = opts;

    if (options.mode === ExecutionModes.SYSTEM) {
      return Object.freeze({
        mode: options.mode,
        request: parent?.request,
        userId: options.userId ?? parent?.userId,
        reason: options.reason,
        values: this.freezeValues({ ...parent?.values }),
      });
    }

    if (options.isRoot && (parent?.request !== undefined || parent?.userId !== undefined)) {
      this.warnRoot();
    }

    const base = options.isRoot ? undefined : parent;

    return Object.freeze({
      mode: options.mode,
      request: base?.request,
      userId: options.userId ?? base?.userId,
      values: this.freezeValues({ ...base?.values, ...options.values }),
    });
  }

  /** A frame from plain JavaScript, or from the framework's own entry, is held to the same rules as a typed call. */
  private assertFrame(opts: { frame: IExecutionFrame }) {
    const mode: unknown = opts.frame.mode;

    if (!ExecutionModes.values().some((value) => value === mode)) {
      throw getError({
        message: `[Execution] unknown mode | mode: ${String(mode)} | known: ${ExecutionModes.values().join(', ')}`,
      });
    }

    const reason: unknown = opts.frame.reason;
    const isBlank = typeof reason !== 'string' || reason.trim() === '';

    if (mode === ExecutionModes.SYSTEM && isBlank) {
      throw getError({ message: '[Execution] a system run needs a reason that is not blank' });
    }
  }

  /** A frozen copy: arrays and plain objects at any depth, so no task changes the values of the frame around it. */
  private freezeValues<Value>(value: Value): Value {
    if (Array.isArray(value)) {
      const items = value.map((item: unknown) => this.freezeValues(item));

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the copy holds the same items under the same shape; the compiler cannot say so for a generic
      return Object.freeze(items) as Value;
    }

    if (!RecordUtility.isPlainObject(value)) {
      return value;
    }

    const entries = Object.entries(value).map(([key, item]) => [key, this.freezeValues(item)]);

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the copy holds the same keys under the same shape; the compiler cannot say so for a generic
    return Object.freeze(Object.fromEntries(entries)) as Value;
  }

  /**
   * Once per route: a root frame drops the request, so the narrowing a request's user brings with it. The key is the
   * route of that request, never a stack.
   */
  private warnRoot(): void {
    if (this.warnedRoots.size >= MAX_WARNED) {
      return;
    }

    const request = RequestContextRegistry.resolve();
    const route = request && 'req' in request ? routePath(request, -1) : 'outside a request';

    if (this.warnedRoots.has(route)) {
      return;
    }

    this.warnedRoots.add(route);
    this.logger
      .for('run')
      .warn(
        'A root frame was opened inside a frame that has a request or a user | it inherits neither',
      );
  }

  /** Every system run is logged with its reason, and the request when there is one; no caller is recorded. */
  private logSystemRun(opts: { frame: IExecutionFrame; parent?: IExecutionFrame }) {
    const { frame, parent } = opts;

    if (frame.mode !== ExecutionModes.SYSTEM) {
      return;
    }

    const reason = frame.reason ?? '';
    const logger = this.logger.for('run');
    const hasValues = Object.keys(parent?.values ?? {}).length > 0;

    if (parent?.mode === ExecutionModes.SCOPED && hasValues && this.isFirstWarning({ reason })) {
      logger.warn(
        'A system run was opened inside a scoped frame that has values: it sees every row | reason: %s',
        reason,
      );
    }

    const requestId: unknown = RequestContextRegistry.resolve()?.get('requestId');

    if (requestId === undefined) {
      logger.debug('System run | reason: %s', reason);

      return;
    }

    logger.info('System run | reason: %s | requestId: %s', reason, requestId);
  }

  private isFirstWarning(opts: { reason: string }) {
    if (this.warnedReasons.has(opts.reason) || this.warnedReasons.size >= MAX_WARNED) {
      return false;
    }

    this.warnedReasons.add(opts.reason);

    return true;
  }
}
