import type {
  IMailMessage,
  IMailSendResult,
  IMailTransport,
  IMailProcessorResult,
} from '@/components/mail/common';
import { BaseApplication } from '@/base/applications';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { isApplicationError, type ApplicationError } from '@venizia/ignis-helpers/core';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';

/** In-memory transport: records what MailService hands to the wire, no SMTP, no network. */
export class FakeMailTransport implements IMailTransport {
  sentMessages: IMailMessage[] = [];
  closeCallCount = 0;

  constructor(
    private behaviour: {
      sendResult?: IMailSendResult;
      sendError?: Error;
      verifyResult?: boolean;
      verifyError?: Error;
    } = {},
  ) {}

  async send(message: IMailMessage): Promise<IMailSendResult> {
    this.sentMessages.push(message);

    if (this.behaviour.sendError) {
      throw this.behaviour.sendError;
    }

    return this.behaviour.sendResult ?? { success: true, messageId: 'fake-message-id' };
  }

  async verify(): Promise<boolean> {
    if (this.behaviour.verifyError) {
      throw this.behaviour.verifyError;
    }

    return this.behaviour.verifyResult ?? true;
  }

  async close(): Promise<void> {
    this.closeCallCount++;
  }
}

/** Captures every scoped log line so a test can assert nothing confidential was written. */
export class FakeLogger {
  lines: string[] = [];

  for(_scope: string) {
    const record = (message: unknown, ...args: unknown[]) => {
      this.lines.push([String(message), ...args.map((arg) => JSON.stringify(arg))].join(' | '));
    };

    return { debug: record, info: record, warn: record, error: record };
  }
}

export const successProcessorResult: IMailProcessorResult = {
  success: true,
  message: 'sent',
  expiresInMinutes: 5,
};

/** Resolves once the processor has been invoked `expected` times (no sleep-and-hope). */
export class ProcessorCallTracker {
  calls: string[] = [];
  private waiters: Array<{ expected: number; resolve: () => void }> = [];

  record(email: string): void {
    this.calls.push(email);

    const waitersList = [...this.waiters];

    for (const waiter of waitersList) {
      if (this.calls.length < waiter.expected) {
        continue;
      }

      this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
      waiter.resolve();
    }
  }

  waitFor(opts: { expected: number }): Promise<void> {
    if (this.calls.length >= opts.expected) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waiters.push({ expected: opts.expected, resolve });
    });
  }
}

/** Runs `run` and returns the error it throws; throws itself when `run` does not throw, or throws a non-Error. */
export const catchError = async (run: () => unknown): Promise<Error> => {
  let thrown: unknown;
  let didThrow = false;

  try {
    await run();
  } catch (caught) {
    thrown = caught;
    didThrow = true;
  }

  if (!didThrow) {
    throw new Error('Expected the call to throw, but it did not');
  }

  if (!(thrown instanceof Error)) {
    throw new Error(`Expected an Error to be thrown, got: ${String(thrown)}`);
  }

  return thrown;
};

/** Like {@link catchError}, and the thrown error must be an `ApplicationError`. */
export const catchApplicationError = async (run: () => unknown): Promise<ApplicationError> => {
  const error = await catchError(run);

  if (!isApplicationError(error)) {
    throw new Error(`Expected an ApplicationError to be thrown, got: ${error.message}`);
  }

  return error;
};

/** A bare application: the mail component binds into it and registers its stop hooks, which are recorded here instead of run. */
export class MailTestApplication extends BaseApplication {
  stopHooks: Array<{ identifier: string; hook: () => ValueOrPromise<void> }> = [];

  constructor(opts: { scope: string }) {
    const config: IApplicationConfigs = {
      host: '127.0.0.1',
      port: 0,
      path: { base: '/', isStrict: false },
    };

    super({ scope: opts.scope, config });
  }

  override registerPostStopHook(opts: {
    identifier: string;
    hook: () => ValueOrPromise<void>;
  }): void {
    this.stopHooks.push(opts);
  }

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'mail-test-app', version: '0.0.0', description: 'Mail component test' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}
}

/** For a test that feeds a wrong shape on purpose: `JSON.parse` answers `any`, and its reviver swaps in `value` as is, so it passes any typed parameter without a cast. */
export const wrongShape = (value: unknown) => JSON.parse('null', () => value);
